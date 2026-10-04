import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { DonationCertificate, DonationCertificateVerification } from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../core/audit/audit.service';
import { isUniqueConstraintViolation } from '../../core/errors/prisma-conflict.util';
import {
  computeCertificateHash,
  generateCertificateCode,
  type DonationCertificatePayload,
} from './donation-certificate-hash';

/** Row shape returned by the SECURITY DEFINER donor/public read functions. */
interface CertificateRow {
  id: string;
  organization_id: string;
  donation_id: string;
  code: string;
  payload: DonationCertificatePayload;
  content_hash: string;
  issued_at: Date;
}

/** ESAL con RTE vigente — el único nivel que emite certificados (RF14). */
const ELIGIBLE_FORMALIZATION_STATE = 'esal_rte';

const CERTIFICATE_CODE_MAX_ATTEMPTS = 3;

/**
 * M05 · Certificado de donación real (RF14, F-3). Se emite automáticamente al
 * aprobarse una donación (junto al recibo), solo si la organización
 * beneficiaria es ESAL con RTE vigente en ese momento. El emisor real
 * (representante legal / revisor fiscal, S-1 de @sebastian) todavía no existe
 * como modelo — la plantilla visual lo trata como texto genérico hasta
 * entonces (ver TODO(S-1) en `certificate-document.tsx`); esta tabla no
 * modela ningún firmante todavía, así que no hay nada que migrar cuando
 * exista: solo se enriquecerá el render.
 */
@Injectable()
export class DonationCertificatesService {
  private readonly logger = new Logger('DonationCertificates');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Intenta emitir el certificado de una donación recién aprobada. Best-effort
   * y SIN lanzar: si la organización no es ESAL con RTE vigente, simplemente
   * no emite nada (no es un error, es el gating documentado). Idempotente por
   * `donationId` (una reentrega del webhook nunca duplica el certificado — la
   * columna es `@unique`).
   */
  async tryIssueForApprovedDonation(input: {
    donationId: string;
    organizationId: string;
    donorName?: string;
    amount: number;
    currency: string;
  }): Promise<void> {
    try {
      await this.prisma.withOrgContext(input.organizationId, async (tx) => {
        const existing = await tx.donationCertificate.findUnique({
          where: { donationId: input.donationId },
        });
        if (existing) return; // ya emitido — reentrega idempotente del webhook.
        await this.issueInTx(tx, input); // null ⇒ no elegible (gating RF14), no es un error.
      });
    } catch (error) {
      // Best-effort, igual que el enganche de campañas: el recibo YA se emitió;
      // un fallo aquí nunca debe tumbar el procesamiento del webhook.
      this.logger.warn(
        `No se pudo emitir el certificado para donation=${input.donationId}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * "Generar certificado" desde "Donaciones recibidas" (la ORGANIZACIÓN, roles de
   * gestión). El certificado solo se emitía automáticamente al aprobarse el pago y,
   * si la organización aún no era ESAL con RTE en ese momento, nunca existía.
   *
   * - Si ya existe, devuelve EL MISMO (mismo código y hash — un certificado es un
   *   documento sellado; nunca se acuña un segundo para la misma donación).
   * - Si no existe, lo emite ahora (solo donación aprobada y organización ESAL con
   *   RTE vigente); si no es elegible, responde 422 con el motivo.
   * Audita quién lo pidió. Si la donación es ANÓNIMA frente a la organización, el
   * nombre del donante se enmascara en la respuesta (el sellado interno no cambia).
   */
  async generateForOrganization(input: {
    donationId: string;
    organizationId: string;
    actorUserId: string;
  }): Promise<DonationCertificate> {
    const { row, anonymous } = await this.prisma.withOrgContext(
      input.organizationId,
      async (tx) => {
        const donation = await tx.donation.findFirst({
          where: { id: input.donationId, organizationId: input.organizationId },
        });
        if (!donation) throw new NotFoundException('Donación no encontrada.');
        if (donation.status !== 'approved') {
          throw new UnprocessableEntityException(
            'Solo se puede generar el certificado de una donación aprobada.',
          );
        }

        let certificate = await tx.donationCertificate.findUnique({
          where: { donationId: donation.id },
        });
        if (!certificate) {
          const payer = donation.payer as { fullName?: string } | null;
          certificate = await this.issueInTx(tx, {
            donationId: donation.id,
            organizationId: input.organizationId,
            donorName: payer?.fullName,
            amount: donation.intendedAmount,
            currency: donation.currency,
          });
          if (!certificate) {
            throw new UnprocessableEntityException(
              'Solo las organizaciones ESAL con RTE vigente pueden emitir certificados de donación.',
            );
          }
        }

        await this.audit.recordWithTx(tx, {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: 'donation.certificate_regenerated',
          entityType: 'donation_certificate',
          entityId: certificate.id,
          metadata: { donationId: donation.id, code: certificate.code },
        });
        return { row: certificate, anonymous: donation.anonymous };
      },
    );

    const result = this.fromRow({
      id: row.id,
      organization_id: row.organizationId,
      donation_id: row.donationId,
      code: row.code,
      payload: row.payload as unknown as DonationCertificatePayload,
      content_hash: row.contentHash,
      issued_at: row.issuedAt,
    });
    return anonymous ? { ...result, donorName: 'Donante anónimo' } : result;
  }

  /**
   * Emite (crea) el certificado dentro de una transacción con contexto de org.
   * `null` si la organización NO es ESAL con RTE vigente y NIT (gating RF14) —
   * o si una carrera concurrente ya lo creó (el llamador relee si lo necesita).
   * Quien llama debe haber comprobado antes que no existe uno.
   */
  private async issueInTx(
    tx: Prisma.TransactionClient,
    input: {
      donationId: string;
      organizationId: string;
      donorName?: string;
      amount: number;
      currency: string;
    },
  ) {
    const [org, profile] = await Promise.all([
      tx.organization.findUniqueOrThrow({ where: { id: input.organizationId } }),
      tx.organizationProfile.findUnique({ where: { organizationId: input.organizationId } }),
    ]);
    const eligible =
      profile?.formalizationState === ELIGIBLE_FORMALIZATION_STATE &&
      profile?.rteVigente === true &&
      Boolean(profile?.nit);
    if (!eligible) return null; // gating RF14: no es ESAL con RTE vigente.

    const issuedAt = new Date();
    const payload: DonationCertificatePayload = {
      organizationName: org.name,
      organizationNit: profile!.nit!,
      donorName: input.donorName?.trim() || 'Donante',
      amount: input.amount,
      currency: input.currency,
      issuedAt: issuedAt.toISOString(),
      donationId: input.donationId,
    };
    const contentHash = computeCertificateHash(payload);

    for (let attempt = 1; attempt <= CERTIFICATE_CODE_MAX_ATTEMPTS; attempt++) {
      const code = generateCertificateCode(issuedAt.getUTCFullYear());
      try {
        const created = await tx.donationCertificate.create({
          data: {
            organizationId: input.organizationId,
            donationId: input.donationId,
            code,
            payload: payload as unknown as Prisma.InputJsonValue,
            contentHash,
            issuedAt,
          },
        });
        await this.audit.recordWithTx(tx, {
          organizationId: input.organizationId,
          actorUserId: null,
          action: 'donation.certificate_issued',
          entityType: 'donation_certificate',
          entityId: created.id,
          // Nunca el nombre/monto en claro fuera de lo ya auditado por la donación.
          metadata: { donationId: input.donationId, code },
        });
        return created;
      } catch (error) {
        if (isUniqueConstraintViolation(error) && attempt < CERTIFICATE_CODE_MAX_ATTEMPTS) {
          continue; // colisión de código (o reentrega concurrente) — reintenta.
        }
        if (isUniqueConstraintViolation(error)) {
          return null; // ya existe (carrera con otra reentrega) — no es un fallo.
        }
        throw error;
      }
    }
    return null;
  }

  /** El certificado de UNA donación, visible solo por su donante (cross-tenant
   *  por identidad, mismo patrón que `getReceiptForDonor`). */
  async getForDonor(donationId: string, userId: string): Promise<DonationCertificate> {
    const rows = await this.prisma.$queryRaw<CertificateRow[]>(Prisma.sql`
      SELECT * FROM donation_certificate_for_donor(${donationId}::uuid, ${userId}::uuid)
    `);
    const row = rows[0];
    if (!row) {
      throw new NotFoundException(
        'Certificado no encontrado, no eres el donante, o la organización no es una ESAL con RTE vigente.',
      );
    }
    return this.fromRow(row);
  }

  /** Verificación PÚBLICA por código (sin sesión) — superficie mínima. */
  async getPublicByCode(code: string): Promise<DonationCertificateVerification> {
    const rows = await this.prisma.$queryRaw<
      Array<{ data: DonationCertificateVerification | null }>
    >(Prisma.sql`SELECT donation_certificate_public(${code}) AS data`);
    const data = rows[0]?.data;
    if (!data) {
      throw new NotFoundException('No existe ningún certificado con ese código.');
    }
    return data;
  }

  private fromRow(row: CertificateRow): DonationCertificate {
    const payload = row.payload;
    return {
      id: row.id,
      organizationId: row.organization_id,
      donationId: row.donation_id,
      code: row.code,
      organizationName: payload.organizationName,
      organizationNit: payload.organizationNit,
      donorName: payload.donorName,
      amount: payload.amount,
      currency: payload.currency as DonationCertificate['currency'],
      issuedAt: row.issued_at.toISOString(),
      contentHash: row.content_hash,
    };
  }
}

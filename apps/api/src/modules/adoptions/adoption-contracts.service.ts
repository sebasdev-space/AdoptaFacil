import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ADOPTION_CONTRACT_APPLICABLE_LAWS,
  DEFAULT_FOLLOW_UP_MONTHS,
  type AdoptionAnimalSnapshot,
  type AdoptionApplicant,
  type AdoptionContract,
  type AdoptionContractData,
  type AdoptionContractPayload,
  type AdoptionContractSigner,
  type AdoptionContractStatus,
  type GenerateAdoptionContractInput,
  type OrganizationLocation,
  type SignAdoptionContractInput,
  type SignaturePort,
  type TransitionAdoptionContractInput,
  type UpdateAdoptionContractDataInput,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { AuditService } from '../../core/audit/audit.service';
import { isUniqueConstraintViolation } from '../../core/errors/prisma-conflict.util';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import {
  SIGNATURE_ENCRYPTION_CONFIG,
  decryptSignature,
  encryptSignature,
  hashSignature,
  type SignatureEncryptionConfig,
} from '../../core/crypto/signature-crypto';
import type { RequestUser } from '../../core/auth/auth.types';
import { computeAge } from '../animals/animal-age';
import { LegalRepresentativeService } from '../org/legal-representative.service';
import { renderAdoptionContractPdf } from './adoption-contract-pdf';
import { checkContractTransition } from './adoption-contract-status';
import { computeContractHash } from './adoption-contract-hash';
import { SIGNATURE_PORT } from './signature/signature.port';

/** Formatea `{ city, address }` de `OrganizationLocation` en una sola línea
 *  de domicilio — mismo criterio que `VolunteerCertificatesService.getOrgCity`
 *  (best-effort: ausente si no hay nada que mostrar). */
function formatOrgAddress(location: OrganizationLocation | null | undefined): string | undefined {
  const parts = [location?.address, location?.city].filter((p): p is string => Boolean(p?.trim()));
  return parts.length > 0 ? parts.join(', ') : undefined;
}

/** Row crudo de `adopter_profile_for_contract(...)` (snake_case, función SQL). */
interface AdopterProfileRow {
  document_id: string | null;
  address: string | null;
}

/** Row shape returned by the SECURITY DEFINER contract functions (snake_case). */
interface ContractRow {
  id: string;
  organization_id: string;
  request_id: string;
  animal_id: string;
  version: number;
  status: string;
  signers: AdoptionContractSigner[];
  payload: AdoptionContractPayload;
  content_hash: string | null;
  created_at: Date;
  updated_at: Date;
  signed_at: Date | null;
}

type ContractModel = Prisma.AdoptionContractGetPayload<Record<string, never>>;

@Injectable()
export class AdoptionContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    @Inject(SIGNATURE_PORT) private readonly signature: SignaturePort,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(SIGNATURE_ENCRYPTION_CONFIG)
    private readonly signatureConfig: SignatureEncryptionConfig,
    private readonly legalRepresentatives: LegalRepresentativeService,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /**
   * Generate the contract for an APPROVED request (§M04, RF11). Org-gated at the
   * controller (Owner/Administrator/Operator). Builds the dynamic signer list
   * (org representative = the actor + adopter = the request's applicant, plus any
   * extra signers), starts it in `draft`, materializes T-028a's `contractRef`
   * seam, and AUDITS the generation (UTC, no PII).
   */
  async generate(
    actor: RequestUser,
    input: GenerateAdoptionContractInput,
  ): Promise<AdoptionContract> {
    const organizationId = this.requireOrgId();
    const created = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const req = await tx.adoptionRequest.findUnique({ where: { id: input.requestId } });
      if (!req || req.organizationId !== organizationId) {
        throw new NotFoundException('Solicitud de adopción no encontrada.');
      }
      if (req.status !== 'approved') {
        throw new ConflictException('La solicitud debe estar aprobada para generar el contrato.');
      }
      const existing = await tx.adoptionContract.findFirst({
        where: { requestId: input.requestId },
      });
      if (existing) {
        throw new ConflictException('Ya existe un contrato para esta solicitud.');
      }

      const applicant = req.applicant as unknown as AdoptionApplicant;
      const animal = req.animalSnapshot as unknown as AdoptionAnimalSnapshot;

      // Auto-rellena `data` con lo que el sistema YA tiene (NIT/domicilio de
      // la organización, raza/sexo/edad del animal, cédula/domicilio del
      // adoptante) — leído FRESCO al generar (no un snapshot viejo), para
      // que la plantilla legal refleje el estado actual. `weightKg`/
      // `healthStatusAtDelivery` quedan sin llenar: no existen en ningún
      // otro lugar del sistema, la organización los diligencia después
      // (`updateData`, mientras el contrato siga en `draft`).
      const [profile, animalRow, adopterProfileRows] = await Promise.all([
        tx.organizationProfile.findUnique({ where: { organizationId } }),
        tx.animal.findUnique({ where: { id: req.animalId }, include: { breed: true } }),
        this.prisma.$queryRaw<AdopterProfileRow[]>(
          Prisma.sql`SELECT * FROM adopter_profile_for_contract(${req.applicantUserId}::uuid)`,
        ),
      ]);
      const location = profile?.location as OrganizationLocation | null | undefined;
      const computedAge = animalRow
        ? computeAge(animalRow.birthDate, animalRow.approximateAgeMonths, new Date())
        : undefined;
      const adopterProfile = adopterProfileRows[0];

      const data: AdoptionContractData = {
        organizationNit: profile?.nit ?? undefined,
        organizationAddress: formatOrgAddress(location),
        animalBreed: animalRow?.breed?.name ?? animalRow?.customBreed ?? undefined,
        animalSex: animalRow?.sex,
        animalAgeYears: computedAge?.years,
        adopterDocumentNumber: adopterProfile?.document_id ?? undefined,
        adopterAddress: adopterProfile?.address ?? undefined,
        followUpMonths: DEFAULT_FOLLOW_UP_MONTHS,
        signatureCity: location?.city,
      };

      const signers: AdoptionContractSigner[] = [
        {
          id: randomUUID(),
          role: 'organization_representative',
          // Reemplazado por el nombre REAL del representante legal vigente
          // en el momento de firmar (`sign()`) — este placeholder solo se ve
          // mientras nadie ha firmado todavía.
          fullName: 'Representante de la organización',
          email: actor.email,
          userId: actor.id,
        },
        {
          id: randomUUID(),
          role: 'adopter',
          fullName: applicant.fullName,
          email: applicant.email,
          userId: req.applicantUserId,
        },
        ...(input.additionalSigners ?? []).map((s) => ({
          id: randomUUID(),
          role: s.role,
          fullName: s.fullName,
          email: s.email,
          userId: s.userId,
        })),
      ];

      const payload: AdoptionContractPayload = {
        requestId: input.requestId,
        organizationId,
        animalId: req.animalId,
        animal,
        applicant,
        applicableLaws: ADOPTION_CONTRACT_APPLICABLE_LAWS,
        terms: input.terms?.trim() ?? '',
        data,
      };

      // TOCTOU: dos requests concurrentes para el mismo `requestId` pueden pasar
      // ambas el `findFirst` de arriba y llegar aquí — la segunda dispara la
      // constraint única `@@unique([requestId, version])` (P2002), que se
      // traduce al mismo 409 controlado en vez de un 500 crudo.
      let row;
      try {
        row = await tx.adoptionContract.create({
          data: {
            organizationId,
            requestId: input.requestId,
            animalId: req.animalId,
            version: 1,
            status: 'draft',
            signers: signers as unknown as Prisma.InputJsonValue,
            payload: payload as unknown as Prisma.InputJsonValue,
          },
        });
      } catch (error) {
        if (isUniqueConstraintViolation(error)) {
          throw new ConflictException('Ya existe un contrato para esta solicitud.');
        }
        throw error;
      }

      // Materialize the T-028a seam: the request now points at its contract.
      await tx.adoptionRequest.update({
        where: { id: input.requestId },
        data: { contractRef: row.id },
      });

      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId: actor.id,
        action: 'adoption.contract.generated',
        entityType: 'adoption_contract',
        entityId: row.id,
        metadata: { requestId: input.requestId, signerCount: signers.length },
      });

      return row;
    });

    return this.fromModel(created);
  }

  /** The contract of a given request, for the OWNING org (RLS-scoped). */
  async getForOrg(requestId: string): Promise<AdoptionContract> {
    const organizationId = this.requireOrgId();
    const row = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.adoptionContract.findFirst({ where: { requestId } }),
    );
    if (!row) {
      throw new NotFoundException('Contrato no encontrado.');
    }
    return this.fromModel(row);
  }

  /**
   * The contract by its OWN id, for the OWNING org (any MANAGE_ROLES member,
   * RLS-scoped) — unlike `getForSigner`, this does NOT require the caller to
   * be personally listed as a signer, so any manager at the org (not just
   * whoever happened to click "Generar contrato") can open the contract
   * detail page.
   */
  async getForOrgById(contractId: string): Promise<AdoptionContract> {
    const organizationId = this.requireOrgId();
    const row = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.adoptionContract.findUnique({ where: { id: contractId } }),
    );
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException('Contrato no encontrado.');
    }
    return this.fromModel(row);
  }

  /**
   * A contract visible to a legitimate SIGNER (org representative or the adopter),
   * resolved cross-tenant via the SECURITY DEFINER function so the adopter (a
   * Person in another tenant) can fetch the contract they must sign.
   */
  async getForSigner(actor: RequestUser, contractId: string): Promise<AdoptionContract> {
    const row = await this.loadForSigner(contractId, actor.id);
    if (!row) {
      throw new NotFoundException('Contrato no encontrado o no eres firmante.');
    }
    return this.fromRow(row);
  }

  /**
   * Move the contract through the org-managed transitions (draft →
   * pending_signatures, or cancel). Org-gated at the controller. A `signed`
   * contract is terminal/immutable → 409.
   *
   * Nuevo requerimiento: "diligenciar los datos, firmar de representante y
   * LUEGO enviarlo a firma del adoptante" — enviar a firmas (`pending_signatures`)
   * ahora REQUIERE que el representante de la organización ya haya firmado
   * (ver `sign()`); de lo contrario el adoptante podría llegar a firmar antes
   * que la organización, invirtiendo el orden pedido.
   */
  async transition(
    actor: RequestUser,
    contractId: string,
    input: TransitionAdoptionContractInput,
  ): Promise<AdoptionContract> {
    const organizationId = this.requireOrgId();
    const updated = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const current = await tx.adoptionContract.findUnique({ where: { id: contractId } });
      if (!current || current.organizationId !== organizationId) {
        throw new NotFoundException('Contrato no encontrado.');
      }
      const check = checkContractTransition(
        current.status as AdoptionContractStatus,
        input.targetStatus,
      );
      if (!check.allowed) {
        throw new ConflictException(check.error);
      }
      if (input.targetStatus === 'pending_signatures') {
        const currentSigners = current.signers as unknown as AdoptionContractSigner[];
        const representative = currentSigners.find((s) => s.role === 'organization_representative');
        if (!representative?.signedAt) {
          throw new ConflictException(
            'El representante de la organización debe firmar el contrato antes de enviarlo a firmas.',
          );
        }
      }
      const next = await tx.adoptionContract.update({
        where: { id: contractId },
        data: { status: input.targetStatus },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId: actor.id,
        action: 'adoption.contract.transitioned',
        entityType: 'adoption_contract',
        entityId: contractId,
        metadata: {
          from: current.status,
          to: input.targetStatus,
          reason: input.reason?.trim() || null,
        },
      });
      return next;
    });
    return this.fromModel(updated);
  }

  /**
   * `PATCH /adoptions/contracts/:id/data` — edita cualquier subconjunto de
   * `AdoptionContractData` (peso, estado de salud, o corregir cualquier otro
   * campo auto-rellenado al generar). Solo permitido mientras el contrato
   * sigue en `draft` Y nadie ha firmado todavía — una vez el representante
   * firma, el contenido que atestiguó queda congelado (aunque el ESTADO del
   * contrato siga en `draft` hasta que se envíe a firmas).
   */
  async updateData(
    actor: RequestUser,
    contractId: string,
    input: UpdateAdoptionContractDataInput,
  ): Promise<AdoptionContract> {
    const organizationId = this.requireOrgId();
    const updated = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const current = await tx.adoptionContract.findUnique({ where: { id: contractId } });
      if (!current || current.organizationId !== organizationId) {
        throw new NotFoundException('Contrato no encontrado.');
      }
      if (current.status !== 'draft') {
        throw new ConflictException('Solo se puede editar un contrato en borrador.');
      }
      const currentSigners = current.signers as unknown as AdoptionContractSigner[];
      if (currentSigners.some((s) => s.signedAt)) {
        throw new ConflictException(
          'El contrato ya tiene firmas registradas y su contenido quedó congelado.',
        );
      }

      const currentPayload = current.payload as unknown as AdoptionContractPayload;
      const nextPayload: AdoptionContractPayload = {
        ...currentPayload,
        data: { ...currentPayload.data, ...input },
      };

      const next = await tx.adoptionContract.update({
        where: { id: contractId },
        data: { payload: nextPayload as unknown as Prisma.InputJsonValue },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId: actor.id,
        action: 'adoption.contract.data_updated',
        entityType: 'adoption_contract',
        entityId: contractId,
        // Solo los NOMBRES de los campos editados — nunca sus valores (Ley 1581).
        metadata: { fields: Object.keys(input) },
      });
      return next;
    });
    return this.fromModel(updated);
  }

  /**
   * Sign one party's part (§M04, RF11). When ALL signers have signed, the
   * canonical payload hash is computed and the contract is SEALED (`signed`,
   * immutable). Each signature and the sealing are AUDITED in UTC (no PII).
   *
   * Dos caminos de firma, según el rol (nuevo requerimiento):
   *   - `organization_representative`: firma EN `draft` (antes de enviar a
   *     firmas), SIN imagen propia — reutiliza en vivo la firma YA registrada
   *     del representante legal vigente (`LegalRepresentativeService`,
   *     requerimiento #16); bloquea con un mensaje claro si la organización
   *     nunca registró uno. Solo reemplaza el `fullName` placeholder del
   *     firmante; la imagen se re-lee al generar el PDF (no se duplica aquí).
   *   - `adopter`/`witness`: firma SOLO en `pending_signatures` (una vez
   *     enviado), y DEBE dibujar/subir una imagen (`signatureBase64`) — se
   *     cifra (AES-256-GCM) y se guarda vía `StoragePort`, igual que
   *     `LegalRepresentativeService.register`. Rechazado con 409 si el
   *     representante todavía no ha firmado (orden reforzado en backend).
   */
  async sign(
    actor: RequestUser,
    contractId: string,
    input: SignAdoptionContractInput,
  ): Promise<AdoptionContract> {
    const row = await this.loadForSigner(contractId, actor.id);
    if (!row) {
      throw new NotFoundException('Contrato no encontrado o no eres firmante.');
    }
    if (row.status === 'signed') {
      throw new ConflictException('El contrato ya está firmado (inmutable).');
    }
    if (row.status !== 'draft' && row.status !== 'pending_signatures') {
      throw new ConflictException(
        `El contrato no está disponible para firma (estado: ${row.status}).`,
      );
    }

    const signers = row.signers;
    const signer = signers.find((s) => s.id === input.signerId);
    if (!signer) {
      throw new NotFoundException('Firmante no encontrado en el contrato.');
    }
    if (signer.userId !== actor.id) {
      throw new ForbiddenException('No puedes firmar por otra persona.');
    }
    if (signer.signedAt) {
      throw new ConflictException('Esa parte ya fue firmada.');
    }

    let fullNameOverride: string | undefined;
    let signatureFileRef: string | undefined;
    let signatureHash: string | undefined;

    if (signer.role === 'organization_representative') {
      const repSigner = await this.legalRepresentatives.getCurrentSignerForOrg(
        row.organization_id,
        'legal_representative',
      );
      if (!repSigner) {
        throw new BadRequestException(
          'Debes registrar un representante legal de la organización antes de firmar ' +
            'contratos de adopción (Organización → Representante legal).',
        );
      }
      fullNameOverride = repSigner.fullName;
    } else {
      if (row.status !== 'pending_signatures') {
        throw new ConflictException('El contrato aún no fue enviado a firmas.');
      }
      const representative = signers.find((s) => s.role === 'organization_representative');
      if (!representative?.signedAt) {
        throw new ConflictException('El representante de la organización debe firmar primero.');
      }
      if (!input.signatureBase64) {
        throw new BadRequestException('Debes dibujar o subir tu firma para firmar el contrato.');
      }
      const plaintext = Buffer.from(input.signatureBase64, 'base64');
      if (plaintext.length === 0) {
        throw new BadRequestException('La firma está vacía o no es una imagen válida.');
      }
      signatureHash = hashSignature(plaintext);
      const encrypted = encryptSignature(plaintext, this.signatureConfig.signatureEncryptionKey);
      const stored = await this.storage.createUploadTarget({
        organizationId: row.organization_id,
        filename: 'adopter-signature.enc',
        visibility: 'private',
      });
      await this.storage.saveObject(stored.key, encrypted, 'application/octet-stream');
      signatureFileRef = stored.key;
    }

    const documentHash = computeContractHash(row.payload);
    const result = await this.signature.sign({
      contractId,
      signerId: signer.id,
      signerRole: signer.role,
      documentHash,
    });

    const nextSigners: AdoptionContractSigner[] = signers.map((s) =>
      s.id === signer.id
        ? {
            ...s,
            fullName: fullNameOverride ?? s.fullName,
            signedAt: result.signedAt,
            signatureId: result.signatureId,
            signatureFileRef: signatureFileRef ?? s.signatureFileRef,
            signatureHash: signatureHash ?? s.signatureHash,
          }
        : s,
    );
    const allSigned = nextSigners.every((s) => Boolean(s.signedAt));
    const contentHash = allSigned ? documentHash : null;

    const updatedRows = await this.prisma.$queryRaw<ContractRow[]>(Prisma.sql`
      SELECT * FROM adoption_contract_apply_signatures(
        ${contractId}::uuid,
        ${actor.id}::uuid,
        ${JSON.stringify(nextSigners)}::jsonb,
        ${allSigned},
        ${contentHash}
      )
    `);
    const updated = updatedRows[0];
    if (!updated) {
      throw new ConflictException('No se pudo registrar la firma (el estado cambió).');
    }

    const organizationId = row.organization_id;
    await this.audit.record({
      organizationId,
      actorUserId: actor.id,
      action: 'adoption.contract.signed',
      entityType: 'adoption_contract',
      entityId: contractId,
      metadata: { signerId: signer.id, role: signer.role, provider: result.provider },
    });
    if (allSigned) {
      await this.audit.record({
        organizationId,
        actorUserId: actor.id,
        action: 'adoption.contract.sealed',
        entityType: 'adoption_contract',
        entityId: contractId,
        metadata: { contentHash },
      });
    }

    return this.fromRow(updated);
  }

  /**
   * Renders the contract as an actual PDF document (same request the client
   * made for M08's certificate/M03's carnet: "debe ser realmente un
   * documento de verdad") — texto legal fijo + datos del payload, con las
   * firmas que ya existan (líneas en blanco para las que faltan). Accesible
   * para cualquier firmante legítimo, en CUALQUIER estado — así la
   * organización puede previsualizar el borrador antes de enviarlo a firmas.
   */
  async generatePdf(actor: RequestUser, contractId: string): Promise<Buffer> {
    const row = await this.loadForSigner(contractId, actor.id);
    if (!row) {
      throw new NotFoundException('Contrato no encontrado o no eres firmante.');
    }

    const representative = row.signers.find((s) => s.role === 'organization_representative');
    const adopter = row.signers.find((s) => s.role === 'adopter');

    const representativeSignaturePng = representative?.signedAt
      ? ((await this.legalRepresentatives.getCurrentSignerForOrg(
          row.organization_id,
          'legal_representative',
        )) ?? null)
      : null;

    let adopterSignaturePng: Buffer | null = null;
    if (adopter?.signatureFileRef) {
      const stored = await this.storage.readObject(adopter.signatureFileRef);
      if (stored) {
        try {
          adopterSignaturePng = decryptSignature(
            stored.data,
            this.signatureConfig.signatureEncryptionKey,
          );
        } catch {
          adopterSignaturePng = null;
        }
      }
    }

    return renderAdoptionContractPdf({
      payload: row.payload,
      signers: row.signers,
      representativeSignaturePng: representativeSignaturePng?.signatureImage ?? null,
      adopterSignaturePng,
    });
  }

  /** Load a contract for a signer via the SECURITY DEFINER function (cross-tenant). */
  private async loadForSigner(contractId: string, userId: string): Promise<ContractRow | null> {
    const rows = await this.prisma.$queryRaw<ContractRow[]>(Prisma.sql`
      SELECT * FROM adoption_contract_for_signer(${contractId}::uuid, ${userId}::uuid)
    `);
    return rows[0] ?? null;
  }

  private fromRow(row: ContractRow): AdoptionContract {
    return {
      id: row.id,
      organizationId: row.organization_id,
      requestId: row.request_id,
      animalId: row.animal_id,
      version: row.version,
      status: row.status as AdoptionContractStatus,
      signers: row.signers,
      payload: row.payload,
      contentHash: row.content_hash ?? undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      signedAt: row.signed_at ? row.signed_at.toISOString() : undefined,
    };
  }

  private fromModel(row: ContractModel): AdoptionContract {
    return {
      id: row.id,
      organizationId: row.organizationId,
      requestId: row.requestId,
      animalId: row.animalId,
      version: row.version,
      status: row.status as AdoptionContractStatus,
      signers: row.signers as unknown as AdoptionContractSigner[],
      payload: row.payload as unknown as AdoptionContractPayload,
      contentHash: row.contentHash ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      signedAt: row.signedAt ? row.signedAt.toISOString() : undefined,
    };
  }
}

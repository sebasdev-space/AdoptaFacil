import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type VolunteerCertificate as CertificateRow } from '@prisma/client';
import {
  type PDFFont,
  type PDFImage,
  type PDFPage,
  PDFDocument,
  StandardFonts,
  rgb,
} from 'pdf-lib';
import type {
  OrganizationLocation,
  Paginated,
  VolunteerCertificate,
  VolunteerCertificateBitacoraEntry,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import type { RequestUser } from '../../core/auth/auth.types';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../../core/notifications/notification.port';
import { LegalRepresentativeService } from '../org/legal-representative.service';
import {
  checkCertificateEligibility,
  hasPendingHours,
  missingGuardianInfo,
  studentServiceMinHours,
  sumApprovedHours,
} from './volunteer-certificate-eligibility';
import {
  buildCertificateIssuedBody,
  buildCertificateIssuedSubject,
} from './volunteer-notifications';
import { clampLimit } from './volunteer-opportunities.service';

function toCertificate(row: CertificateRow): VolunteerCertificate {
  return {
    id: row.id,
    organizationId: row.organizationId,
    enrollmentId: row.enrollmentId,
    volunteerUserId: row.volunteerUserId,
    volunteerName: row.volunteerName,
    organizationName: row.organizationName,
    opportunityTitle: row.opportunityTitle,
    totalApprovedHours: row.totalApprovedHours,
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
    appliesToStudentService: row.appliesToStudentService,
    issuedByUserId: row.issuedByUserId,
    issuedAt: row.issuedAt.toISOString(),
    guardianName: row.guardianName ?? undefined,
    guardianDocument: row.guardianDocument ?? undefined,
    schoolName: row.schoolName ?? undefined,
    schoolAgreementCode: row.schoolAgreementCode ?? undefined,
    bitacora: (row.bitacora as unknown as VolunteerCertificateBitacoraEntry[]) ?? [],
  };
}

/** JSONB row from `volunteer_certificates_for_user(...)` — already camelCase. */
interface CertificateMineRow {
  id: string;
  organizationId: string;
  enrollmentId: string;
  volunteerUserId: string;
  volunteerName: string;
  organizationName: string;
  opportunityTitle: string;
  totalApprovedHours: number;
  periodStart: string;
  periodEnd: string;
  appliesToStudentService: boolean;
  issuedByUserId: string;
  issuedAt: string;
  guardianName: string | null;
  guardianDocument: string | null;
  schoolName: string | null;
  schoolAgreementCode: string | null;
  bitacora: VolunteerCertificateBitacoraEntry[];
}

function fromMineRow(row: CertificateMineRow): VolunteerCertificate {
  return {
    ...row,
    guardianName: row.guardianName ?? undefined,
    guardianDocument: row.guardianDocument ?? undefined,
    schoolName: row.schoolName ?? undefined,
    schoolAgreementCode: row.schoolAgreementCode ?? undefined,
    bitacora: row.bitacora ?? [],
  };
}

/** Raw snake_case row from `volunteer_certificate_for_viewer(...)` — a plain
 *  `SELECT * FROM <table-returning function>`, so Prisma's `@map()` camelCase
 *  translation (which only applies to the ORM client, `tx.volunteerCertificate.*`)
 *  does NOT apply here; columns come back exactly as declared in the DB. */
interface CertificateViewerRow {
  id: string;
  organization_id: string;
  enrollment_id: string;
  volunteer_user_id: string;
  volunteer_name: string;
  organization_name: string;
  opportunity_title: string;
  total_approved_hours: number;
  period_start: Date;
  period_end: Date;
  applies_to_student_service: boolean;
  issued_by_user_id: string;
  issued_at: Date;
  guardian_name: string | null;
  guardian_document: string | null;
  school_name: string | null;
  school_agreement_code: string | null;
  bitacora: VolunteerCertificateBitacoraEntry[];
}

function fromViewerRow(row: CertificateViewerRow): VolunteerCertificate {
  return {
    id: row.id,
    organizationId: row.organization_id,
    enrollmentId: row.enrollment_id,
    volunteerUserId: row.volunteer_user_id,
    volunteerName: row.volunteer_name,
    organizationName: row.organization_name,
    opportunityTitle: row.opportunity_title,
    totalApprovedHours: row.total_approved_hours,
    periodStart: row.period_start.toISOString(),
    periodEnd: row.period_end.toISOString(),
    appliesToStudentService: row.applies_to_student_service,
    issuedByUserId: row.issued_by_user_id,
    issuedAt: row.issued_at.toISOString(),
    guardianName: row.guardian_name ?? undefined,
    guardianDocument: row.guardian_document ?? undefined,
    schoolName: row.school_name ?? undefined,
    schoolAgreementCode: row.school_agreement_code ?? undefined,
    bitacora: row.bitacora ?? [],
  };
}

function formatCO(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Certificates (RF18/RF19 · M08). Issued explicitly by Owner/Administrator for
 * ONE enrollment — never automatic. Gated by `checkCertificateEligibility`:
 * general volunteering has no minimum; student social service requires
 * `studentServiceMinHours()` (80h default, RF19) of APPROVED hours. Reads are
 * dual-viewer (the issuing org OR the certificate's own volunteer) via the
 * `volunteer_certificate_for_viewer` SECURITY DEFINER function — append-only
 * once issued (DB triggers reject any mutation, see the S-6 migration).
 */
@Injectable()
export class VolunteerCertificatesService {
  private readonly logger = new Logger('VolunteerCertificates');

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
    private readonly legalRepresentatives: LegalRepresentativeService,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /** Issue a certificate for one enrollment (Owner/Administrator, own tenant). */
  async issue(actorUserId: string, enrollmentId: string): Promise<VolunteerCertificate> {
    const organizationId = this.requireOrgId();

    const created = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const enrollment = await tx.volunteerEnrollment.findUnique({ where: { id: enrollmentId } });
      if (!enrollment || enrollment.organizationId !== organizationId) {
        throw new NotFoundException('Volunteer enrollment not found');
      }
      if (enrollment.status !== 'accepted' && enrollment.status !== 'completed') {
        throw new BadRequestException(
          'Solo se puede emitir un certificado para una inscripción aceptada o completada.',
        );
      }
      const existing = await tx.volunteerCertificate.findUnique({ where: { enrollmentId } });
      if (existing) {
        throw new BadRequestException('Ya existe un certificado emitido para esta inscripción.');
      }

      const hoursEntries = await tx.serviceHours.findMany({
        where: { enrollmentId },
        orderBy: { date: 'asc' },
      });
      // Nuevo requerimiento (voluntariado): no se emite un certificado sin
      // ninguna hora registrada, ni mientras queden horas `pending` por
      // decidir — la organización debe cerrar el libro de la inscripción
      // primero (aprobar/rechazar todo lo pendiente).
      if (hoursEntries.length === 0) {
        throw new BadRequestException(
          'No se puede emitir el certificado: esta inscripción no tiene horas registradas.',
        );
      }
      if (hasPendingHours(hoursEntries)) {
        throw new BadRequestException(
          'No se puede emitir el certificado: aún hay horas pendientes de aprobar o rechazar.',
        );
      }
      const totalApprovedHours = sumApprovedHours(hoursEntries);
      const minHours = studentServiceMinHours();
      const eligibility = checkCertificateEligibility(
        enrollment.appliesToStudentService,
        totalApprovedHours,
        minHours,
      );
      if (!eligibility.eligible) {
        throw new BadRequestException(
          `No se puede emitir el certificado: faltan ${eligibility.missingHours} horas efectivas ` +
            `para alcanzar el mínimo de ${minHours} horas del servicio social estudiantil (Resolución 4210/1996, art. 6°).`,
        );
      }
      // S-12 (FSD v3.5 Doc 8): a minor's student-service certificate names the
      // guardian who authorized it. Enforced HERE (issuance), not at signup —
      // an org can request the missing guardian info from the volunteer and
      // simply hold off on issuing until it's on the enrollment.
      if (
        missingGuardianInfo(
          enrollment.appliesToStudentService,
          enrollment.isMinor,
          enrollment.guardianName,
          enrollment.guardianDocument,
        )
      ) {
        throw new BadRequestException(
          'No se puede emitir el certificado: falta el nombre y documento del acudiente ' +
            'para esta inscripción de servicio social de un menor de edad.',
        );
      }

      const opportunity = await tx.volunteerOpportunity.findUniqueOrThrow({
        where: { id: enrollment.opportunityId },
      });
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: organizationId },
      });

      // Bitácora (FSD Doc 8): derived from the enrollment's OWN approved
      // sessions — never a separate capture. Supervisor name is a live join
      // against `users` (org staff, same tenant as this tx, unlike the
      // cross-tenant volunteer) — best-effort, absent if a lookup ever fails.
      const approvedHoursEntries = hoursEntries.filter((entry) => entry.status === 'approved');
      const supervisorIds = [
        ...new Set(
          approvedHoursEntries
            .map((entry) => entry.decidedByUserId)
            .filter((id): id is string => id !== null),
        ),
      ];
      const supervisors =
        supervisorIds.length > 0
          ? await tx.user.findMany({
              where: { id: { in: supervisorIds } },
              select: { id: true, displayName: true },
            })
          : [];
      const supervisorNameById = new Map(supervisors.map((s) => [s.id, s.displayName]));
      const bitacora: VolunteerCertificateBitacoraEntry[] = approvedHoursEntries.map((entry) => ({
        date: entry.date.toISOString(),
        hours: entry.hours,
        description: entry.description,
        supervisorName: entry.decidedByUserId
          ? supervisorNameById.get(entry.decidedByUserId)
          : undefined,
      }));

      const row = await tx.volunteerCertificate.create({
        data: {
          organizationId,
          enrollmentId,
          volunteerUserId: enrollment.volunteerUserId,
          volunteerName: enrollment.volunteerName,
          organizationName: organization.name,
          opportunityTitle: opportunity.title,
          totalApprovedHours,
          periodStart: opportunity.startDate,
          periodEnd: opportunity.endDate,
          appliesToStudentService: enrollment.appliesToStudentService,
          issuedByUserId: actorUserId,
          guardianName: enrollment.guardianName,
          guardianDocument: enrollment.guardianDocument,
          schoolName: enrollment.schoolName,
          schoolAgreementCode: enrollment.schoolAgreementCode,
          bitacora: bitacora as unknown as Prisma.InputJsonValue,
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'volunteering.certificate_issued',
        entityType: 'volunteer_certificate',
        entityId: row.id,
        metadata: { enrollmentId, totalApprovedHours },
      });
      return { row, volunteerEmail: enrollment.volunteerEmail };
    });

    try {
      const emailInput = {
        volunteerName: created.row.volunteerName,
        opportunityTitle: created.row.opportunityTitle,
        organizationName: created.row.organizationName,
        totalApprovedHours: created.row.totalApprovedHours,
      };
      await this.notifications.send({
        to: created.volunteerEmail,
        subject: buildCertificateIssuedSubject(emailInput),
        body: buildCertificateIssuedBody(emailInput),
      });
    } catch (error) {
      this.logger.warn(`No se pudo notificar al voluntario: ${(error as Error).message}`);
    }

    return toCertificate(created.row);
  }

  /** Paginated list of certificates issued by the caller's org. */
  async listByOrg(limit: number, offset: number): Promise<Paginated<VolunteerCertificate>> {
    const organizationId = this.requireOrgId();
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const where = { organizationId };
      const [rows, total] = await Promise.all([
        tx.volunteerCertificate.findMany({ where, orderBy: { issuedAt: 'desc' }, take, skip }),
        tx.volunteerCertificate.count({ where }),
      ]);
      return { items: rows.map(toCertificate), total, limit: take, offset: skip };
    });
  }

  /** The volunteer's own certificates (cross-tenant, by identity) — "mis
   *  certificados". */
  async listMine(actor: RequestUser): Promise<VolunteerCertificate[]> {
    const rows = await this.prisma.$queryRaw<Array<{ data: CertificateMineRow[] }>>(
      Prisma.sql`SELECT volunteer_certificates_for_user(${actor.id}::uuid) AS data`,
    );
    return (rows[0]?.data ?? []).map(fromMineRow);
  }

  /** Dual-viewer read: the certificate's own volunteer OR a member of the
   *  issuing organization. Returns null for anyone else (⇒ 404). */
  private async forViewer(id: string, actor: RequestUser): Promise<VolunteerCertificate | null> {
    const rows = await this.prisma.$queryRaw<CertificateViewerRow[]>(
      Prisma.sql`SELECT * FROM volunteer_certificate_for_viewer(${id}::uuid, ${actor.id}::uuid, ${actor.organizationId}::uuid)`,
    );
    const row = rows[0];
    return row ? fromViewerRow(row) : null;
  }

  async get(id: string, actor: RequestUser): Promise<VolunteerCertificate> {
    const row = await this.forViewer(id, actor);
    if (!row) {
      throw new NotFoundException('Volunteer certificate not found');
    }
    return row;
  }

  /** Best-effort: the issuing org's city (for "Emitido en <ciudad>, el
   *  <fecha>"), read fresh at render time — absent rather than fabricated
   *  when the org never filled it in, or on any read failure. */
  private async getOrgCity(organizationId: string): Promise<string | undefined> {
    try {
      const profile = await this.prisma.withOrgContext(organizationId, (tx) =>
        tx.organizationProfile.findUnique({
          where: { organizationId },
          select: { location: true },
        }),
      );
      const location = profile?.location as OrganizationLocation | null | undefined;
      return location?.city?.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Renders the certificate as an actual diploma-style document (S-14,
   * pedido del cliente: "debe ser realmente un verdadero certificado de horas
   * sociales"), landscape A4 — organization letterhead, the volunteer's name
   * as the honoree (diploma convention), hours/dates/opportunity, and a real
   * signature block: the org's CURRENT legal representative's name +
   * DECRYPTED signature image (`LegalRepresentativeService`, S-14), never
   * fabricated — falls back to a generic "Representante Legal" label when no
   * legal representative has been registered yet, or if the signature can't
   * be read/decrypted for any reason.
   *
   * Same `pdf-lib` technique already used for the M03 vaccination carnet
   * (`CarnetService`), generated on demand from the stored (immutable)
   * record, never persisted as a separate file via StoragePort. The
   * bitácora (hour-by-hour log) moves to a plain portrait appendix page —
   * it doesn't belong on the ornate certificate page, but nothing it showed
   * before is lost.
   */
  async generatePdf(id: string, actor: RequestUser): Promise<Buffer> {
    const row = await this.forViewer(id, actor);
    if (!row) {
      throw new NotFoundException('Volunteer certificate not found');
    }

    const [signer, city] = await Promise.all([
      this.legalRepresentatives.getCurrentSignerForOrg(row.organizationId).catch(() => null),
      this.getOrgCity(row.organizationId),
    ]);

    const pdf = await PDFDocument.create();
    const serif = await pdf.embedFont(StandardFonts.TimesRoman);
    const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
    const serifItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
    const sans = await pdf.embedFont(StandardFonts.Helvetica);
    const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    // Embebido ANTES de dibujar (pdf-lib es async aquí) — nunca dentro de la
    // función de dibujo, que debe quedar síncrona. Una firma corrupta/no-PNG
    // nunca rompe la generación: se sigue sin imagen (fallback de texto).
    const signatureImage = signer
      ? await pdf.embedPng(signer.signatureImage).catch(() => null)
      : null;

    drawCertificatePage(pdf, {
      font: { serif, serifBold, serifItalic, sans, sansBold },
      row,
      signer,
      signatureImage,
      city,
    });

    if (row.bitacora.length > 0) {
      drawBitacoraAppendix(pdf, { font: { sans, sansBold }, row });
    }

    const bytes = await pdf.save();
    return Buffer.from(bytes);
  }
}

// ---------------------------------------------------------------------------
// Dibujo del PDF (S-14) — funciones libres (no dependen de `this`), reciben
// todo lo que necesitan por parámetro. Separado de la clase para que el
// layout del certificado se pueda leer/ajustar sin tocar la lógica de datos.
// ---------------------------------------------------------------------------

const NAVY = rgb(0.08, 0.16, 0.3);
const GOLD = rgb(0.62, 0.5, 0.22);
const INK = rgb(0.15, 0.15, 0.15);
const MUTED = rgb(0.42, 0.42, 0.42);

interface CertificateFonts {
  serif: PDFFont;
  serifBold: PDFFont;
  serifItalic: PDFFont;
  sans: PDFFont;
  sansBold: PDFFont;
}

function drawCentered(
  page: PDFPage,
  pageWidth: number,
  text: string,
  y: number,
  font: PDFFont,
  size: number,
  color = INK,
): void {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (pageWidth - width) / 2, y, size, font, color });
}

/** Word-wraps `text` to fit within `maxWidth` at `size` — pdf-lib never wraps
 *  text on its own. Never splits a single word, however long. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(attempt, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = attempt;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawCenteredParagraph(
  page: PDFPage,
  pageWidth: number,
  text: string,
  startY: number,
  font: PDFFont,
  size: number,
  maxWidth: number,
  lineHeight: number,
  color = INK,
): number {
  let y = startY;
  for (const line of wrapText(text, font, size, maxWidth)) {
    drawCentered(page, pageWidth, line, y, font, size, color);
    y -= lineHeight;
  }
  return y;
}

function drawCenteredRule(
  page: PDFPage,
  pageWidth: number,
  y: number,
  width: number,
  color: ReturnType<typeof rgb>,
  thickness = 1,
): void {
  const x = (pageWidth - width) / 2;
  page.drawLine({ start: { x, y }, end: { x: x + width, y }, thickness, color });
}

/** El certificado en sí: una sola página apaisada (diploma). */
function drawCertificatePage(
  pdf: PDFDocument,
  input: {
    font: CertificateFonts;
    row: VolunteerCertificate;
    signer: { fullName: string; position: string } | null;
    signatureImage: PDFImage | null;
    city?: string;
  },
): void {
  const { font, row, signer, signatureImage, city } = input;
  const PAGE_WIDTH = 841.89;
  const PAGE_HEIGHT = 595.28;
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const outerMargin = 28;
  const innerMargin = 40;
  const contentWidth = PAGE_WIDTH - innerMargin * 2;

  // Marco decorativo doble: borde grueso azul + filete dorado interior — el
  // aspecto de "documento oficial" que pedía el cliente, sin depender de
  // ningún color de marca dinámico (esto es un documento formal, no el
  // portal público).
  page.drawRectangle({
    x: outerMargin,
    y: outerMargin,
    width: PAGE_WIDTH - outerMargin * 2,
    height: PAGE_HEIGHT - outerMargin * 2,
    borderColor: NAVY,
    borderWidth: 2.5,
  });
  page.drawRectangle({
    x: outerMargin + 8,
    y: outerMargin + 8,
    width: PAGE_WIDTH - (outerMargin + 8) * 2,
    height: PAGE_HEIGHT - (outerMargin + 8) * 2,
    borderColor: GOLD,
    borderWidth: 1,
  });

  let y = PAGE_HEIGHT - innerMargin - 46;

  // Membrete: nombre de la organización.
  drawCentered(page, PAGE_WIDTH, row.organizationName.toUpperCase(), y, font.sansBold, 13, NAVY);
  y -= 10;
  drawCenteredRule(page, PAGE_WIDTH, y, 90, GOLD, 1.5);
  y -= 42;

  // Título — distingue constancia de servicio social estudiantil vs. certificado general.
  const title = row.appliesToStudentService
    ? 'CONSTANCIA DE SERVICIO SOCIAL ESTUDIANTIL'
    : 'CERTIFICADO DE HORAS DE VOLUNTARIADO';
  drawCentered(page, PAGE_WIDTH, title, y, font.serifBold, 25, NAVY);
  y -= 30;
  drawCenteredRule(page, PAGE_WIDTH, y, 220, GOLD, 1);
  y -= 40;

  drawCentered(
    page,
    PAGE_WIDTH,
    'Se otorga el presente reconocimiento a:',
    y,
    font.serifItalic,
    13,
    MUTED,
  );
  y -= 36;

  // El nombre del voluntario, protagonista del documento (convención de diploma).
  drawCentered(page, PAGE_WIDTH, row.volunteerName, y, font.serifBold, 26, INK);
  y -= 14;
  drawCenteredRule(page, PAGE_WIDTH, y, 320, NAVY, 0.75);
  y -= 34;

  const bodyMaxWidth = contentWidth - 160;
  const guardianClause = row.guardianName
    ? ` quien actuó con la debida autorización de su acudiente ${row.guardianName}` +
      (row.guardianDocument ? ` (documento ${row.guardianDocument}),` : ',')
    : '';
  const body =
    `por su participación voluntaria en "${row.opportunityTitle}",${guardianClause} ` +
    `desarrollada del ${formatCO(row.periodStart)} al ${formatCO(row.periodEnd)}, durante la cual ` +
    `completó un total de ${row.totalApprovedHours} horas de servicio efectivamente verificadas.`;
  y = drawCenteredParagraph(page, PAGE_WIDTH, body, y, font.serif, 13, bodyMaxWidth, 20);

  if (row.appliesToStudentService) {
    y -= 8;
    y = drawCenteredParagraph(
      page,
      PAGE_WIDTH,
      'Válido para servicio social estudiantil (Resolución 4210 de 1996, artículo 6°).' +
        (row.schoolName
          ? ` Institución educativa: ${row.schoolName}` +
            (row.schoolAgreementCode ? ` (convenio ${row.schoolAgreementCode})` : '') +
            '.'
          : ''),
      y,
      font.serifItalic,
      10.5,
      bodyMaxWidth,
      15,
      MUTED,
    );
  }

  // --- Pie: fecha/lugar de emisión (izquierda) + bloque de firma (derecha) ---
  const footerY = outerMargin + 70;
  const leftX = innerMargin + 20;
  const issuedLine = city
    ? `Emitido en ${city}, el ${formatCO(row.issuedAt)}.`
    : `Emitido el ${formatCO(row.issuedAt)}.`;
  page.drawText(issuedLine, { x: leftX, y: footerY, size: 10, font: font.sans, color: MUTED });
  page.drawText(`Certificado N.° ${row.id.slice(0, 8).toUpperCase()}`, {
    x: leftX,
    y: footerY - 16,
    size: 9,
    font: font.sans,
    color: MUTED,
  });

  const signatureBlockWidth = 220;
  const signatureBlockX = PAGE_WIDTH - innerMargin - 20 - signatureBlockWidth;
  const signatureLineY = footerY + 6;

  if (signatureImage) {
    // La imagen de la firma se dibuja ENCIMA de la línea (como una firma
    // real), nunca ENCIMA del texto del nombre — igual que un documento
    // firmado a mano. Ya viene embebida (async, resuelta antes de llamar a
    // esta función síncrona) — aquí solo se posiciona.
    const naturalWidth = signatureImage.width || 400;
    const naturalHeight = signatureImage.height || 150;
    const drawWidth = Math.min(160, naturalWidth);
    const drawHeight = (drawWidth / naturalWidth) * naturalHeight;
    page.drawImage(signatureImage, {
      x: signatureBlockX + (signatureBlockWidth - drawWidth) / 2,
      y: signatureLineY + 4,
      width: drawWidth,
      height: drawHeight,
    });
  }

  drawCenteredRuleAt(page, signatureBlockX, signatureBlockWidth, signatureLineY, INK, 0.75);
  const signerName = signer?.fullName ?? '________________________';
  const signerPosition = signer?.position ?? 'Representante Legal';
  drawCenteredIn(
    page,
    signatureBlockX,
    signatureBlockWidth,
    signerName,
    signatureLineY - 16,
    font.sansBold,
    11,
    INK,
  );
  drawCenteredIn(
    page,
    signatureBlockX,
    signatureBlockWidth,
    signer ? signerPosition : 'Representante Legal',
    signatureLineY - 30,
    font.sans,
    9.5,
    MUTED,
  );
}

function drawCenteredRuleAt(
  page: PDFPage,
  blockX: number,
  blockWidth: number,
  y: number,
  color: ReturnType<typeof rgb>,
  thickness: number,
): void {
  page.drawLine({
    start: { x: blockX, y },
    end: { x: blockX + blockWidth, y },
    thickness,
    color,
  });
}

function drawCenteredIn(
  page: PDFPage,
  blockX: number,
  blockWidth: number,
  text: string,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
): void {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: blockX + (blockWidth - width) / 2, y, size, font, color });
}

/** Anexo con la bitácora hora a hora — página aparte, en vertical, con el
 *  mismo estilo simple y legible que el generador anterior ya usaba (nada de
 *  esto se pierde, solo se separa de la página del certificado). */
function drawBitacoraAppendix(
  pdf: PDFDocument,
  input: { font: { sans: PDFFont; sansBold: PDFFont }; row: VolunteerCertificate },
): void {
  const { font, row } = input;
  const margin = 50;
  const pageSize: [number, number] = [595.28, 841.89]; // A4 vertical
  const page = pdf.addPage(pageSize);
  let y = pageSize[1] - margin - 20;

  page.drawText(`Anexo — Bitácora de horas certificadas (${row.volunteerName})`, {
    x: margin,
    y,
    size: 13,
    font: font.sansBold,
    color: INK,
  });
  y -= 26;

  for (const entry of row.bitacora) {
    const supervisor = entry.supervisorName ? ` · Supervisor: ${entry.supervisorName}` : '';
    const line = `${formatCO(entry.date)} — ${entry.hours}h — ${entry.description}${supervisor}`;
    for (const wrapped of wrapText(line, font.sans, 10, pageSize[0] - margin * 2)) {
      if (y < margin) break; // límite simple de una sola página de anexo
      page.drawText(wrapped, { x: margin, y, size: 10, font: font.sans, color: INK });
      y -= 14;
    }
  }
}

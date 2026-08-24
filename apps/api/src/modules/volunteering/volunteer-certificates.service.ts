import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type VolunteerCertificate as CertificateRow } from '@prisma/client';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { Paginated, VolunteerCertificate } from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import type { RequestUser } from '../../core/auth/auth.types';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../../core/notifications/notification.port';
import {
  checkCertificateEligibility,
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
}

function fromMineRow(row: CertificateMineRow): VolunteerCertificate {
  return { ...row };
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
        select: { status: true, hours: true },
      });
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

      const opportunity = await tx.volunteerOpportunity.findUniqueOrThrow({
        where: { id: enrollment.opportunityId },
      });
      const organization = await tx.organization.findUniqueOrThrow({
        where: { id: organizationId },
      });

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

  /** Renders the certificate as a simple, legible PDF — same `pdf-lib`
   *  technique already used for the M03 vaccination carnet (`CarnetService`),
   *  generated on demand from the stored (immutable) record, never persisted
   *  as a separate file via StoragePort. */
  async generatePdf(id: string, actor: RequestUser): Promise<Buffer> {
    const row = await this.forViewer(id, actor);
    if (!row) {
      throw new NotFoundException('Volunteer certificate not found');
    }

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const margin = 50;
    const pageSize: [number, number] = [595.28, 841.89]; // A4
    const page = pdf.addPage(pageSize);
    let y = pageSize[1] - margin - 40;

    function drawLine(text: string, options: { size?: number; useBold?: boolean } = {}): void {
      const size = options.size ?? 12;
      page.drawText(text, {
        x: margin,
        y,
        size,
        font: options.useBold ? bold : font,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= size + 10;
    }

    drawLine(row.organizationName, { size: 14, useBold: true });
    drawLine('Certificado de voluntariado', { size: 18, useBold: true });
    y -= 10;
    drawLine(`Se certifica que ${row.volunteerName}`, { size: 12 });
    drawLine(`participó en "${row.opportunityTitle}"`, { size: 12 });
    drawLine(`del ${formatCO(row.periodStart)} al ${formatCO(row.periodEnd)},`, { size: 12 });
    drawLine(`completando ${row.totalApprovedHours} horas efectivas.`, { size: 12, useBold: true });
    if (row.appliesToStudentService) {
      y -= 6;
      drawLine('Válido para servicio social estudiantil (Resolución 4210/1996, art. 6°).', {
        size: 10,
      });
    }
    y -= 20;
    drawLine(`Emitido el ${formatCO(row.issuedAt)}.`, { size: 10 });

    const bytes = await pdf.save();
    return Buffer.from(bytes);
  }
}

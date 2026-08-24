import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { VolunteerEnrollment as EnrollmentRow } from '@prisma/client';
import {
  type DecideVolunteerEnrollmentInput,
  type Paginated,
  type VolunteerEnrollment,
  VolunteerEnrollmentStatus,
  type VolunteerEnrollmentMine,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import type { RequestUser } from '../../core/auth/auth.types';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../../core/notifications/notification.port';
import { checkEnrollmentTransition } from './volunteer-enrollment-status';
import {
  buildEnrollmentConfirmationBody,
  buildEnrollmentConfirmationSubject,
  buildEnrollmentDecisionBody,
  buildEnrollmentDecisionSubject,
} from './volunteer-notifications';
import { clampLimit } from './volunteer-opportunities.service';

/** Row shape returned by the raw SQL `create_volunteer_enrollment(...)`. */
interface EnrollmentRawRow {
  id: string;
  organization_id: string;
  opportunity_id: string;
  volunteer_user_id: string;
  volunteer_name: string;
  volunteer_email: string;
  applies_to_student_service: boolean;
  status: string;
  rejection_reason: string | null;
  decided_by_user_id: string | null;
  decided_at: Date | null;
  created_at: Date;
}

/** One JSONB element from `volunteer_enrollments_for_user(...)` — already
 *  camelCase (built with `jsonb_build_object` in the function itself). */
interface EnrollmentMineRow {
  id: string;
  organizationId: string;
  organizationName: string;
  opportunityId: string;
  opportunityTitle: string;
  volunteerUserId: string;
  appliesToStudentService: boolean;
  status: string;
  rejectionReason: string | null;
  decidedByUserId: string | null;
  decidedAt: string | null;
  createdAt: string;
}

function toEnrollment(row: EnrollmentRow): VolunteerEnrollment {
  return {
    id: row.id,
    organizationId: row.organizationId,
    opportunityId: row.opportunityId,
    volunteerUserId: row.volunteerUserId,
    volunteerName: row.volunteerName,
    volunteerEmail: row.volunteerEmail,
    appliesToStudentService: row.appliesToStudentService,
    status: row.status as VolunteerEnrollmentStatus,
    rejectionReason: row.rejectionReason ?? undefined,
    decidedByUserId: row.decidedByUserId ?? undefined,
    decidedAt: row.decidedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function fromRawRow(row: EnrollmentRawRow): VolunteerEnrollment {
  return {
    id: row.id,
    organizationId: row.organization_id,
    opportunityId: row.opportunity_id,
    volunteerUserId: row.volunteer_user_id,
    volunteerName: row.volunteer_name,
    volunteerEmail: row.volunteer_email,
    appliesToStudentService: row.applies_to_student_service,
    status: row.status as VolunteerEnrollmentStatus,
    rejectionReason: row.rejection_reason ?? undefined,
    decidedByUserId: row.decided_by_user_id ?? undefined,
    decidedAt: row.decided_at?.toISOString(),
    createdAt: row.created_at.toISOString(),
  };
}

function toMine(row: EnrollmentMineRow): VolunteerEnrollmentMine {
  return {
    id: row.id,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    opportunityId: row.opportunityId,
    opportunityTitle: row.opportunityTitle,
    volunteerUserId: row.volunteerUserId,
    volunteerName: '',
    volunteerEmail: '',
    appliesToStudentService: row.appliesToStudentService,
    status: row.status as VolunteerEnrollmentStatus,
    rejectionReason: row.rejectionReason ?? undefined,
    decidedByUserId: row.decidedByUserId ?? undefined,
    decidedAt: row.decidedAt ?? undefined,
    createdAt: row.createdAt,
  };
}

/**
 * Volunteer enrollments (RF18 · M08). Subscribing is open to ANY authenticated
 * Person (the volunteer, cross-tenant by design — same pattern as M07
 * sponsorships' `subscribe`); deciding (accept/reject) is Owner/Administrator
 * within their own tenant context (regular RLS write, no cross-tenant
 * function needed — the org already owns the row).
 */
@Injectable()
export class VolunteerEnrollmentsService {
  private readonly logger = new Logger('VolunteerEnrollments');

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

  /** Enroll in an opportunity — cross-tenant (SECURITY DEFINER). */
  async enroll(actor: RequestUser, opportunityId: string): Promise<VolunteerEnrollment> {
    let rows: EnrollmentRawRow[];
    try {
      rows = await this.prisma.$queryRaw<EnrollmentRawRow[]>(
        Prisma.sql`SELECT * FROM create_volunteer_enrollment(${opportunityId}::uuid, ${actor.id}::uuid)`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/unique/i.test(message)) {
        throw new BadRequestException('Ya estás inscrito en esta oportunidad.');
      }
      throw error;
    }
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('Volunteer opportunity not found or not active');
    }
    await this.audit.record({
      organizationId: row.organization_id,
      actorUserId: actor.id,
      action: 'volunteering.enrollment_created',
      entityType: 'volunteer_enrollment',
      entityId: row.id,
      metadata: { opportunityId },
    });

    const opportunity = await this.prisma.volunteerOpportunity.findUnique({
      where: { id: opportunityId },
    });
    const organization = await this.prisma.organization.findUnique({
      where: { id: row.organization_id },
    });
    try {
      const emailInput = {
        volunteerName: row.volunteer_name,
        opportunityTitle: opportunity?.title ?? '',
        organizationName: organization?.name ?? '',
      };
      await this.notifications.send({
        to: row.volunteer_email,
        subject: buildEnrollmentConfirmationSubject(emailInput),
        body: buildEnrollmentConfirmationBody(emailInput),
      });
    } catch (error) {
      this.logger.warn(`No se pudo notificar al voluntario: ${(error as Error).message}`);
    }

    return fromRawRow(row);
  }

  /** The volunteer's own enrollments (cross-tenant, by identity) — "mis
   *  inscripciones". `volunteerName`/`volunteerEmail` are not meaningfully
   *  used in this view (the caller already knows their own identity) — same
   *  convention as `sponsorships_for_sponsor`, which never returns the
   *  sponsor's own name either, only the OTHER party's (org/plan/animal). */
  async listMine(actor: RequestUser): Promise<VolunteerEnrollmentMine[]> {
    const rows = await this.prisma.$queryRaw<Array<{ data: EnrollmentMineRow[] }>>(
      Prisma.sql`SELECT volunteer_enrollments_for_user(${actor.id}::uuid) AS data`,
    );
    const items = rows[0]?.data ?? [];
    return items.map((row) => ({ ...toMine(row), volunteerEmail: actor.email }));
  }

  /** Paginated list of the caller's org enrollment queue, newest first. */
  async list(
    limit: number,
    offset: number,
    filters: { opportunityId?: string; status?: VolunteerEnrollmentStatus } = {},
  ): Promise<Paginated<VolunteerEnrollment>> {
    const organizationId = this.requireOrgId();
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const where = {
        organizationId,
        ...(filters.opportunityId ? { opportunityId: filters.opportunityId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      };
      const [rows, total] = await Promise.all([
        tx.volunteerEnrollment.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
        tx.volunteerEnrollment.count({ where }),
      ]);
      return { items: rows.map(toEnrollment), total, limit: take, offset: skip };
    });
  }

  async get(id: string): Promise<VolunteerEnrollment> {
    const organizationId = this.requireOrgId();
    const row = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.volunteerEnrollment.findUnique({ where: { id } }),
    );
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException('Volunteer enrollment not found');
    }
    return toEnrollment(row);
  }

  /** Accept/reject a pending enrollment (Owner/Administrator, own tenant). */
  async decide(
    actorUserId: string,
    id: string,
    input: DecideVolunteerEnrollmentInput,
  ): Promise<VolunteerEnrollment> {
    const organizationId = this.requireOrgId();
    const to =
      input.decision === 'accept'
        ? VolunteerEnrollmentStatus.Accepted
        : VolunteerEnrollmentStatus.Rejected;

    const { updated, opportunityTitle } = await this.prisma.withOrgContext(
      organizationId,
      async (tx) => {
        const existing = await tx.volunteerEnrollment.findUnique({ where: { id } });
        if (!existing || existing.organizationId !== organizationId) {
          throw new NotFoundException('Volunteer enrollment not found');
        }
        const from = existing.status as VolunteerEnrollmentStatus;
        const check = checkEnrollmentTransition(from, to);
        if (!check.allowed) {
          throw new BadRequestException(check.error);
        }
        const row = await tx.volunteerEnrollment.update({
          where: { id },
          data: {
            status: to,
            rejectionReason: input.decision === 'reject' ? input.reason : undefined,
            decidedByUserId: actorUserId,
            decidedAt: new Date(),
          },
        });
        await this.audit.recordWithTx(tx, {
          organizationId,
          actorUserId,
          action: `volunteering.enrollment_${input.decision}ed`,
          entityType: 'volunteer_enrollment',
          entityId: id,
          metadata: { reason: input.reason },
        });
        const opportunity = await tx.volunteerOpportunity.findUnique({
          where: { id: row.opportunityId },
        });
        return { updated: row, opportunityTitle: opportunity?.title ?? '' };
      },
    );

    try {
      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
      });
      const emailInput = {
        volunteerName: updated.volunteerName,
        opportunityTitle,
        organizationName: organization?.name ?? '',
        accepted: input.decision === 'accept',
        rejectionReason: updated.rejectionReason ?? undefined,
      };
      await this.notifications.send({
        to: updated.volunteerEmail,
        subject: buildEnrollmentDecisionSubject(emailInput),
        body: buildEnrollmentDecisionBody(emailInput),
      });
    } catch (error) {
      this.logger.warn(`No se pudo notificar al voluntario: ${(error as Error).message}`);
    }

    return toEnrollment(updated);
  }

  /** Mark an accepted enrollment as completed (Owner/Administrator). */
  async complete(actorUserId: string, id: string): Promise<VolunteerEnrollment> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.volunteerEnrollment.findUnique({ where: { id } });
      if (!existing || existing.organizationId !== organizationId) {
        throw new NotFoundException('Volunteer enrollment not found');
      }
      const from = existing.status as VolunteerEnrollmentStatus;
      const check = checkEnrollmentTransition(from, VolunteerEnrollmentStatus.Completed);
      if (!check.allowed) {
        throw new BadRequestException(check.error);
      }
      const row = await tx.volunteerEnrollment.update({
        where: { id },
        data: { status: VolunteerEnrollmentStatus.Completed },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'volunteering.enrollment_completed',
        entityType: 'volunteer_enrollment',
        entityId: id,
      });
      return toEnrollment(row);
    });
  }
}

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ServiceHours as ServiceHoursRow } from '@prisma/client';
import type {
  DecideServiceHoursInput,
  Paginated,
  ServiceHours,
  ServiceHoursStatus,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import type { RequestUser } from '../../core/auth/auth.types';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../../core/notifications/notification.port';
import {
  buildServiceHoursDecisionBody,
  buildServiceHoursDecisionSubject,
} from './volunteer-notifications';
import { clampLimit } from './volunteer-opportunities.service';

/** Row shape returned by the raw SQL `create_service_hours(...)`. */
interface ServiceHoursRawRow {
  id: string;
  organization_id: string;
  enrollment_id: string;
  volunteer_user_id: string;
  date: Date;
  hours: number;
  description: string;
  status: string;
  rejection_reason: string | null;
  decided_by_user_id: string | null;
  decided_at: Date | null;
  created_at: Date;
}

function toServiceHours(row: ServiceHoursRow): ServiceHours {
  return {
    id: row.id,
    organizationId: row.organizationId,
    enrollmentId: row.enrollmentId,
    volunteerUserId: row.volunteerUserId,
    date: row.date.toISOString(),
    hours: row.hours,
    description: row.description,
    status: row.status as ServiceHoursStatus,
    rejectionReason: row.rejectionReason ?? undefined,
    decidedByUserId: row.decidedByUserId ?? undefined,
    decidedAt: row.decidedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function fromRawRow(row: ServiceHoursRawRow): ServiceHours {
  return {
    id: row.id,
    organizationId: row.organization_id,
    enrollmentId: row.enrollment_id,
    volunteerUserId: row.volunteer_user_id,
    date: row.date.toISOString(),
    hours: row.hours,
    description: row.description,
    status: row.status as ServiceHoursStatus,
    rejectionReason: row.rejection_reason ?? undefined,
    decidedByUserId: row.decided_by_user_id ?? undefined,
    decidedAt: row.decided_at?.toISOString(),
    createdAt: row.created_at.toISOString(),
  };
}

/** JSONB row from `service_hours_for_user(...)` — already camelCase AND
 *  already string dates (built with `jsonb_build_object` inside the SQL
 *  function itself; unlike the raw-table row above, there is no `Date`
 *  object to call `.toISOString()` on here). */
interface ServiceHoursMineRow {
  id: string;
  organizationId: string;
  enrollmentId: string;
  volunteerUserId: string;
  date: string;
  hours: number;
  description: string;
  status: string;
  rejectionReason: string | null;
  decidedByUserId: string | null;
  decidedAt: string | null;
  createdAt: string;
}

function fromMineRow(row: ServiceHoursMineRow): ServiceHours {
  return {
    id: row.id,
    organizationId: row.organizationId,
    enrollmentId: row.enrollmentId,
    volunteerUserId: row.volunteerUserId,
    date: row.date,
    hours: row.hours,
    description: row.description,
    status: row.status as ServiceHoursStatus,
    rejectionReason: row.rejectionReason ?? undefined,
    decidedByUserId: row.decidedByUserId ?? undefined,
    decidedAt: row.decidedAt ?? undefined,
    createdAt: row.createdAt,
  };
}

/**
 * Service-hours sessions (RF18/RF19 · M08). Logged by the volunteer against
 * their OWN accepted enrollment — cross-tenant (SECURITY DEFINER, same
 * technique as `create_volunteer_enrollment`); decided (approve/reject) by
 * Owner/Administrator within their own tenant context. Only `approved` hours
 * ever count as "horas efectivas" (see `volunteer-certificate-eligibility.ts`).
 */
@Injectable()
export class ServiceHoursService {
  private readonly logger = new Logger('ServiceHours');

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

  /** Log a session against the caller's OWN accepted enrollment — cross-tenant. */
  async log(
    actor: RequestUser,
    input: { enrollmentId: string; date: string; hours: number; description: string },
  ): Promise<ServiceHours> {
    const rows = await this.prisma.$queryRaw<ServiceHoursRawRow[]>(
      Prisma.sql`SELECT * FROM create_service_hours(${input.enrollmentId}::uuid, ${actor.id}::uuid, ${input.date}::timestamp, ${input.hours}, ${input.description})`,
    );
    const row = rows[0];
    if (!row) {
      throw new BadRequestException(
        'La inscripción no existe, no es tuya, o aún no fue aceptada por la organización.',
      );
    }
    await this.audit.record({
      organizationId: row.organization_id,
      actorUserId: actor.id,
      action: 'volunteering.service_hours_logged',
      entityType: 'service_hours',
      entityId: row.id,
      metadata: { enrollmentId: input.enrollmentId, hours: input.hours },
    });
    return fromRawRow(row);
  }

  /** The volunteer's own logged hours (cross-tenant, by identity) — "mis horas". */
  async listMine(actor: RequestUser): Promise<ServiceHours[]> {
    const rows = await this.prisma.$queryRaw<Array<{ data: ServiceHoursMineRow[] }>>(
      Prisma.sql`SELECT service_hours_for_user(${actor.id}::uuid) AS data`,
    );
    const items = rows[0]?.data ?? [];
    return items.map(fromMineRow);
  }

  /** Paginated list of an enrollment's logged hours, within the caller's org. */
  async listByEnrollment(
    enrollmentId: string,
    limit: number,
    offset: number,
  ): Promise<Paginated<ServiceHours>> {
    const organizationId = this.requireOrgId();
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const where = { organizationId, enrollmentId };
      const [rows, total] = await Promise.all([
        tx.serviceHours.findMany({ where, orderBy: { date: 'desc' }, take, skip }),
        tx.serviceHours.count({ where }),
      ]);
      return { items: rows.map(toServiceHours), total, limit: take, offset: skip };
    });
  }

  /** Approve/reject a pending hours entry (Owner/Administrator, own tenant). */
  async decide(
    actorUserId: string,
    id: string,
    input: DecideServiceHoursInput,
  ): Promise<ServiceHours> {
    const organizationId = this.requireOrgId();
    const approved = input.decision === 'approve';

    const { updated, opportunityTitle, volunteerName, volunteerEmail } =
      await this.prisma.withOrgContext(organizationId, async (tx) => {
        const existing = await tx.serviceHours.findUnique({ where: { id } });
        if (!existing || existing.organizationId !== organizationId) {
          throw new NotFoundException('Service hours entry not found');
        }
        if (existing.status !== 'pending') {
          throw new BadRequestException(
            `This service-hours entry has already been decided (status=${existing.status}).`,
          );
        }
        const row = await tx.serviceHours.update({
          where: { id },
          data: {
            status: approved ? 'approved' : 'rejected',
            rejectionReason: approved ? undefined : input.reason,
            decidedByUserId: actorUserId,
            decidedAt: new Date(),
          },
        });
        await this.audit.recordWithTx(tx, {
          organizationId,
          actorUserId,
          action: `volunteering.service_hours_${input.decision}d`,
          entityType: 'service_hours',
          entityId: id,
          metadata: { reason: input.reason },
        });
        const enrollment = await tx.volunteerEnrollment.findUnique({
          where: { id: row.enrollmentId },
        });
        const opportunity = enrollment
          ? await tx.volunteerOpportunity.findUnique({ where: { id: enrollment.opportunityId } })
          : null;
        return {
          updated: row,
          opportunityTitle: opportunity?.title ?? '',
          volunteerName: enrollment?.volunteerName ?? '',
          volunteerEmail: enrollment?.volunteerEmail ?? '',
        };
      });

    try {
      const emailInput = {
        volunteerName,
        opportunityTitle,
        hours: updated.hours,
        approved,
        rejectionReason: updated.rejectionReason ?? undefined,
      };
      await this.notifications.send({
        to: volunteerEmail,
        subject: buildServiceHoursDecisionSubject(emailInput),
        body: buildServiceHoursDecisionBody(emailInput),
      });
    } catch (error) {
      this.logger.warn(`No se pudo notificar al voluntario: ${(error as Error).message}`);
    }

    return toServiceHours(updated);
  }
}

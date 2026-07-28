import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  Sponsorship as SponsorshipModel,
  SponsorshipStatusHistory as HistoryRow,
} from '@prisma/client';
import {
  type CreateSponsorshipInput,
  type Paginated,
  type Sponsorship,
  SponsorshipStatus,
  type SponsorshipStatusHistoryEntry,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import type { RequestUser } from '../../core/auth/auth.types';
import { checkSponsorshipTransition } from './sponsorship-status';
import { clampLimit } from './sponsorship-plans.service';

/** Row shape returned by the raw SQL `create_sponsorship(...)` (snake_case —
 *  Prisma's camelCase mapping only applies to the ORM client, not $queryRaw). */
interface SponsorshipRawRow {
  id: string;
  organization_id: string;
  plan_id: string;
  animal_id: string;
  sponsor_user_id: string;
  status: string;
  started_at: Date;
  suspended_at: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
}

/** ORM reads (tx.sponsorship.*) already come back camelCase via Prisma's @map. */
function toSponsorship(row: SponsorshipModel): Sponsorship {
  return {
    id: row.id,
    organizationId: row.organizationId,
    planId: row.planId,
    animalId: row.animalId,
    sponsorUserId: row.sponsorUserId,
    status: row.status as SponsorshipStatus,
    startedAt: row.startedAt.toISOString(),
    suspendedAt: row.suspendedAt?.toISOString(),
    cancelledAt: row.cancelledAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Raw `create_sponsorship(...)` result (snake_case columns) → contract shape. */
function fromRawRow(row: SponsorshipRawRow): Sponsorship {
  return {
    id: row.id,
    organizationId: row.organization_id,
    planId: row.plan_id,
    animalId: row.animal_id,
    sponsorUserId: row.sponsor_user_id,
    status: row.status as SponsorshipStatus,
    startedAt: row.started_at.toISOString(),
    suspendedAt: row.suspended_at?.toISOString(),
    cancelledAt: row.cancelled_at?.toISOString(),
    createdAt: row.created_at.toISOString(),
  };
}

function toHistoryEntry(row: HistoryRow): SponsorshipStatusHistoryEntry {
  return {
    id: row.id,
    sponsorshipId: row.sponsorshipId,
    fromStatus: (row.fromStatus as SponsorshipStatus | null) ?? undefined,
    toStatus: row.toStatus as SponsorshipStatus,
    actorUserId: row.actorUserId ?? undefined,
    reason: row.reason ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Sponsorships (RF17 · T-056) — a Person (padrino) SUBSCRIBES to another org's
 * plan (cross-tenant creation, same technique as M05 donations); the org then
 * suspends/reactivates/cancels WITHIN its own tenant context (regular RLS write).
 * This slice creates NO payment — TODO(T-057): wire real recurring charges
 * through PAYMENT_PORT (the plan's `amount`/`periodicity` already carry what a
 * future collection would need; nothing here assumes money changed hands).
 */
@Injectable()
export class SponsorshipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /**
   * Subscribe to a plan (any authenticated Person). Cross-tenant: the sponsor is
   * not a member of the plan's org, so creation goes through the bounded
   * SECURITY DEFINER `create_sponsorship` (validates the plan exists and is
   * active, inserts the sponsorship + its initial history entry atomically).
   * TODO(T-057): this is where a real PaymentPort collection would be started.
   */
  async subscribe(actor: RequestUser, input: CreateSponsorshipInput): Promise<Sponsorship> {
    const rows = await this.prisma.$queryRaw<SponsorshipRawRow[]>(
      Prisma.sql`SELECT * FROM create_sponsorship(${input.planId}::uuid, ${actor.id}::uuid)`,
    );
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('Sponsorship plan not found or archived');
    }
    await this.audit.record({
      organizationId: row.organization_id,
      actorUserId: actor.id,
      action: 'sponsorship.created',
      entityType: 'sponsorship',
      entityId: row.id,
      metadata: { planId: input.planId },
    });
    return fromRawRow(row);
  }

  /** Paginated list of the caller's org sponsorships, newest first; optional filters. */
  async list(
    limit: number,
    offset: number,
    filters: { animalId?: string; status?: SponsorshipStatus } = {},
  ): Promise<Paginated<Sponsorship>> {
    const organizationId = this.requireOrgId();
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const where = {
        organizationId,
        ...(filters.animalId ? { animalId: filters.animalId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      };
      const [rows, total] = await Promise.all([
        tx.sponsorship.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
        tx.sponsorship.count({ where }),
      ]);
      return { items: rows.map(toSponsorship), total, limit: take, offset: skip };
    });
  }

  /** One sponsorship of the caller's org. */
  async get(id: string): Promise<Sponsorship> {
    const organizationId = this.requireOrgId();
    const row = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.sponsorship.findUnique({ where: { id } }),
    );
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException('Sponsorship not found');
    }
    return toSponsorship(row);
  }

  /** The immutable status history of one of the caller's org sponsorships. */
  async history(id: string): Promise<SponsorshipStatusHistoryEntry[]> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const sponsorship = await tx.sponsorship.findUnique({ where: { id } });
      if (!sponsorship || sponsorship.organizationId !== organizationId) {
        throw new NotFoundException('Sponsorship not found');
      }
      const rows = await tx.sponsorshipStatusHistory.findMany({
        where: { sponsorshipId: id },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toHistoryEntry);
    });
  }

  /**
   * Apply a status transition (suspend/reactivate/cancel) within the caller's own
   * tenant context (regular authenticated write — no cross-tenant function
   * needed, unlike creation). Validates the transition via the pure state machine
   * and records BOTH the sponsorship's new status/timestamp AND the immutable
   * history entry, atomically; audited (UTC), with an optional free-text reason.
   */
  private async transition(
    actorUserId: string,
    id: string,
    to: SponsorshipStatus,
    reason?: string,
  ): Promise<Sponsorship> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.sponsorship.findUnique({ where: { id } });
      if (!existing || existing.organizationId !== organizationId) {
        throw new NotFoundException('Sponsorship not found');
      }
      const from = existing.status as SponsorshipStatus;
      const check = checkSponsorshipTransition(from, to);
      if (!check.allowed) {
        throw new BadRequestException(check.error);
      }

      const timestampField =
        to === SponsorshipStatus.Suspended
          ? { suspendedAt: new Date() }
          : to === SponsorshipStatus.Cancelled
            ? { cancelledAt: new Date() }
            : {};
      const updated = await tx.sponsorship.update({
        where: { id },
        data: { status: to, ...timestampField },
      });
      await tx.sponsorshipStatusHistory.create({
        data: {
          organizationId,
          sponsorshipId: id,
          fromStatus: from,
          toStatus: to,
          actorUserId,
          reason: reason ?? null,
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: `sponsorship.${to}`,
        entityType: 'sponsorship',
        entityId: id,
        metadata: { from, to },
      });
      return toSponsorship(updated);
    });
  }

  suspend(actorUserId: string, id: string, reason?: string): Promise<Sponsorship> {
    return this.transition(actorUserId, id, SponsorshipStatus.Suspended, reason);
  }

  reactivate(actorUserId: string, id: string, reason?: string): Promise<Sponsorship> {
    return this.transition(actorUserId, id, SponsorshipStatus.Active, reason);
  }

  cancel(actorUserId: string, id: string, reason?: string): Promise<Sponsorship> {
    return this.transition(actorUserId, id, SponsorshipStatus.Cancelled, reason);
  }
}

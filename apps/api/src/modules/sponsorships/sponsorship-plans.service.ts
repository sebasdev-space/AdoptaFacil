import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { SponsorshipPlan as PlanRow } from '@prisma/client';
import {
  type CreateSponsorshipPlanInput,
  type Paginated,
  type SponsorshipPeriodicity,
  type SponsorshipPlan,
  type UpdateSponsorshipPlanInput,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';

const MAX_PAGE = 50;
const DEFAULT_PAGE = 20;

/** Clamp a requested page size to [1, MAX_PAGE] (local to this module — kept
 *  independent from other modules' pagination helpers by design). */
export function clampLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_PAGE;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE);
}

function toPlan(row: PlanRow): SponsorshipPlan {
  return {
    id: row.id,
    organizationId: row.organizationId,
    animalId: row.animalId,
    name: row.name,
    amount: row.amount,
    periodicity: row.periodicity as SponsorshipPeriodicity,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Sponsorship PLANS (RF17 · T-056) — tenant-scoped (RLS): an org creates/edits
 * plans only for ITS OWN animals. Money is validated as an integer COP > 0 by the
 * zod schema at the controller boundary; archiving (`isActive:false`) never
 * physically removes a plan (existing sponsorships on it are unaffected).
 */
@Injectable()
export class SponsorshipPlansService {
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

  /** Create a plan for one of the caller's OWN active animals; audited. */
  async create(actorUserId: string, input: CreateSponsorshipPlanInput): Promise<SponsorshipPlan> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const animal = await tx.animal.findUnique({ where: { id: input.animalId } });
      if (!animal || !animal.isActive) {
        throw new BadRequestException('Animal not found or inactive');
      }
      const row = await tx.sponsorshipPlan.create({
        data: {
          organizationId,
          animalId: input.animalId,
          name: input.name,
          amount: input.amount,
          periodicity: input.periodicity,
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'sponsorship_plan.created',
        entityType: 'sponsorship_plan',
        entityId: row.id,
        metadata: { animalId: input.animalId, amount: input.amount },
      });
      return toPlan(row);
    });
  }

  /** Paginated list of the caller's org plans, newest first; optional animalId filter. */
  async list(
    limit: number,
    offset: number,
    animalId?: string,
  ): Promise<Paginated<SponsorshipPlan>> {
    const organizationId = this.requireOrgId();
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const where = { organizationId, ...(animalId ? { animalId } : {}) };
      const [rows, total] = await Promise.all([
        tx.sponsorshipPlan.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
        tx.sponsorshipPlan.count({ where }),
      ]);
      return { items: rows.map(toPlan), total, limit: take, offset: skip };
    });
  }

  /** One plan of the caller's org. */
  async get(id: string): Promise<SponsorshipPlan> {
    const organizationId = this.requireOrgId();
    const row = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.sponsorshipPlan.findUnique({ where: { id } }),
    );
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException('Sponsorship plan not found');
    }
    return toPlan(row);
  }

  /** Patch a plan (incl. archiving via isActive:false); audited. */
  async update(
    actorUserId: string,
    id: string,
    input: UpdateSponsorshipPlanInput,
  ): Promise<SponsorshipPlan> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.sponsorshipPlan.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException('Sponsorship plan not found');
      }
      const updated = await tx.sponsorshipPlan.update({
        where: { id },
        data: {
          name: input.name,
          amount: input.amount,
          periodicity: input.periodicity,
          isActive: input.isActive,
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'sponsorship_plan.updated',
        entityType: 'sponsorship_plan',
        entityId: id,
        metadata: { fields: Object.keys(input) },
      });
      return toPlan(updated);
    });
  }
}

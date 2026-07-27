import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Campaign as CampaignRow } from '@prisma/client';
import {
  type Campaign,
  type CampaignCategory,
  type CampaignStatus,
  type CreateCampaignInput,
  type Paginated,
  type UpdateCampaignInput,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { computeProgress } from './campaign-progress';

const MAX_PAGE = 50;
const DEFAULT_PAGE = 20;

function toCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    organizationId: row.organizationId,
    title: row.title,
    description: row.description ?? undefined,
    category: row.category as CampaignCategory,
    goalAmount: row.goalAmount,
    raisedAmount: row.raisedAmount,
    progress: computeProgress(row.raisedAmount, row.goalAmount),
    deadline: row.deadline.toISOString(),
    status: row.status as CampaignStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Clamp a requested page size to [1, MAX_PAGE]. */
export function clampLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_PAGE;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE);
}

@Injectable()
export class CampaignsService {
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

  /** Create a campaign (active, raised 0); audited. */
  async create(actorUserId: string, input: CreateCampaignInput): Promise<Campaign> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const row = await tx.campaign.create({
        data: {
          organizationId,
          title: input.title,
          description: input.description ?? null,
          category: input.category,
          goalAmount: input.goalAmount,
          deadline: new Date(input.deadline),
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'campaign.created',
        entityType: 'campaign',
        entityId: row.id,
        metadata: { category: input.category },
      });
      return toCampaign(row);
    });
  }

  /** Paginated list of the caller's org campaigns, newest first. */
  async list(limit: number, offset: number): Promise<Paginated<Campaign>> {
    const organizationId = this.requireOrgId();
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.campaign.findMany({
          where: { organizationId },
          orderBy: { createdAt: 'desc' },
          take,
          skip,
        }),
        tx.campaign.count({ where: { organizationId } }),
      ]);
      return { items: rows.map(toCampaign), total, limit: take, offset: skip };
    });
  }

  /** One campaign of the caller's org. */
  async get(id: string): Promise<Campaign> {
    const organizationId = this.requireOrgId();
    const row = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.campaign.findUnique({ where: { id } }),
    );
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException('Campaign not found');
    }
    return toCampaign(row);
  }

  /** Patch a campaign; audits an update, or a status change specifically. */
  async update(actorUserId: string, id: string, input: UpdateCampaignInput): Promise<Campaign> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.campaign.findUnique({ where: { id } });
      if (!existing) {
        throw new NotFoundException('Campaign not found');
      }
      const updated = await tx.campaign.update({
        where: { id },
        data: {
          title: input.title,
          description: input.description,
          category: input.category,
          goalAmount: input.goalAmount,
          status: input.status,
          deadline: input.deadline ? new Date(input.deadline) : undefined,
        },
      });
      const statusChanged = input.status !== undefined && input.status !== existing.status;
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: statusChanged ? 'campaign.status_changed' : 'campaign.updated',
        entityType: 'campaign',
        entityId: id,
        metadata: statusChanged
          ? { from: existing.status, to: input.status }
          : { fields: Object.keys(input) },
      });
      return toCampaign(updated);
    });
  }
}

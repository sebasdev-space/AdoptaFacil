import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CampaignEvidence as EvidenceRow } from '@prisma/client';
import {
  type CampaignEvidence,
  type CampaignEvidenceType,
  type CampaignEvidenceUploadResult,
  type CreateCampaignEvidenceInput,
  type Paginated,
  type UpdateCampaignEvidenceInput,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import { clampLimit } from './campaigns.service';

function toEvidence(row: EvidenceRow): CampaignEvidence {
  return {
    id: row.id,
    organizationId: row.organizationId,
    campaignId: row.campaignId,
    type: row.type as CampaignEvidenceType,
    concept: row.concept,
    amount: row.amount ?? undefined,
    spentAt: row.spentAt.toISOString(),
    storageRef: row.storageRef,
    order: row.order,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Accountability evidences (RF16 · T-054). Tenant-scoped (RLS): an org only ever
 * touches its OWN campaigns' evidences. Files are reserved through StoragePort as
 * PUBLIC objects (the donor must see them); only the storage ref + business
 * metadata are persisted. Removal is logical (deleted_at); every mutation is
 * audited (append-only, UTC). No money is raised/executed here (that is T-055).
 */
@Injectable()
export class CampaignEvidencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /**
   * Reserve a PUBLIC upload target and register the evidence (metadata only);
   * audited. The client PUTs the file bytes to the returned upload URL next.
   * The campaign must belong to the caller's org (RLS + explicit check).
   */
  async create(
    actorUserId: string,
    campaignId: string,
    input: CreateCampaignEvidenceInput,
  ): Promise<CampaignEvidenceUploadResult> {
    const organizationId = this.requireOrgId();
    const stored = await this.storage.createUploadTarget({
      organizationId,
      filename: input.filename,
      contentType: input.contentType,
      // Evidences are PUBLIC — the donor must be able to open them (RF16).
      visibility: 'public',
    });
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const campaign = await tx.campaign.findUnique({ where: { id: campaignId } });
      if (!campaign) {
        throw new NotFoundException('Campaign not found');
      }
      const order =
        input.order ??
        ((await tx.campaignEvidence.aggregate({ where: { campaignId }, _max: { order: true } }))
          ._max.order ?? -1) + 1;
      const row = await tx.campaignEvidence.create({
        data: {
          organizationId,
          campaignId,
          type: input.type,
          concept: input.concept,
          amount: input.amount ?? null,
          spentAt: new Date(input.spentAt),
          storageRef: stored.key,
          order,
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'campaign.evidence_added',
        entityType: 'campaign_evidence',
        entityId: row.id,
        metadata: { campaignId, type: input.type },
      });
      return { evidence: toEvidence(row), upload: { url: stored.url, key: stored.key } };
    });
  }

  /** Paginated list of a campaign's (non-deleted) evidences, by display order. */
  async list(
    campaignId: string,
    limit: number,
    offset: number,
  ): Promise<Paginated<CampaignEvidence>> {
    const organizationId = this.requireOrgId();
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const where = { campaignId, deletedAt: null };
      const [rows, total] = await Promise.all([
        tx.campaignEvidence.findMany({
          where,
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
          take,
          skip,
        }),
        tx.campaignEvidence.count({ where }),
      ]);
      return { items: rows.map(toEvidence), total, limit: take, offset: skip };
    });
  }

  /** Patch an evidence's business fields; audited. */
  async update(
    actorUserId: string,
    campaignId: string,
    id: string,
    input: UpdateCampaignEvidenceInput,
  ): Promise<CampaignEvidence> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.campaignEvidence.findUnique({ where: { id } });
      if (!existing || existing.campaignId !== campaignId || existing.deletedAt) {
        throw new NotFoundException('Evidence not found');
      }
      const updated = await tx.campaignEvidence.update({
        where: { id },
        data: {
          type: input.type,
          concept: input.concept,
          amount: input.amount,
          spentAt: input.spentAt ? new Date(input.spentAt) : undefined,
          order: input.order,
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'campaign.evidence_updated',
        entityType: 'campaign_evidence',
        entityId: id,
        metadata: { fields: Object.keys(input) },
      });
      return toEvidence(updated);
    });
  }

  /** Logical removal (deleted_at); audited. Never a physical DELETE. */
  async remove(actorUserId: string, campaignId: string, id: string): Promise<void> {
    const organizationId = this.requireOrgId();
    await this.prisma.withOrgContext(organizationId, async (tx) => {
      const existing = await tx.campaignEvidence.findUnique({ where: { id } });
      if (!existing || existing.campaignId !== campaignId || existing.deletedAt) {
        throw new NotFoundException('Evidence not found');
      }
      await tx.campaignEvidence.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'campaign.evidence_removed',
        entityType: 'campaign_evidence',
        entityId: id,
      });
    });
  }
}

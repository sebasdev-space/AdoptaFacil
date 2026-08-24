import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CampaignEvidence as EvidenceRow } from '@prisma/client';
import {
  type CampaignEvidence,
  type CampaignEvidenceType,
  type CampaignEvidenceUploadResult,
  type CreateCampaignEvidenceInput,
  type Paginated,
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
 * Accountability evidences (RF16 · T-054, hardened to append-only immutable in
 * S-4). Tenant-scoped (RLS): an org only ever touches its OWN campaigns'
 * evidences. Files are reserved through StoragePort as PUBLIC objects (the
 * donor must see them); only the storage ref + business metadata are
 * persisted. A published evidence can never be edited or removed — the DB
 * rejects UPDATE/DELETE/TRUNCATE unconditionally (see the S-4 migration) — so
 * this service exposes only `create`/`list`. Every upload is audited
 * (append-only, UTC). No money is raised/executed here (that is T-055).
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

  /** Paginated list of a campaign's evidences, by display order. */
  async list(
    campaignId: string,
    limit: number,
    offset: number,
  ): Promise<Paginated<CampaignEvidence>> {
    const organizationId = this.requireOrgId();
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const where = { campaignId };
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
}

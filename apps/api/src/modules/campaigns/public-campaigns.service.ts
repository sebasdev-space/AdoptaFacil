import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type Campaign as CampaignRow } from '@prisma/client';
import {
  type CampaignAccountabilityReport,
  type CampaignCategory,
  type CampaignEvidencePublic,
  type CampaignEvidenceType,
  type CampaignPublic,
  type CampaignStatus,
  type Paginated,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import { sumDeclaredSpending } from './campaign-accountability';
import { computeProgress } from './campaign-progress';
import { clampLimit } from './campaigns.service';

/** Raw public campaign row emitted by the SECURITY DEFINER functions (no progress). */
interface RawPublicCampaign {
  id: string;
  organizationId: string;
  organizationName: string;
  title: string;
  description: string | null;
  category: string;
  goalAmount: number;
  raisedAmount: number;
  deadline: string;
  status: string;
  createdAt: string;
}

function toPublic(raw: RawPublicCampaign): CampaignPublic {
  return {
    id: raw.id,
    organizationId: raw.organizationId,
    organizationName: raw.organizationName,
    title: raw.title,
    description: raw.description ?? undefined,
    category: raw.category as CampaignCategory,
    goalAmount: raw.goalAmount,
    raisedAmount: raw.raisedAmount,
    progress: computeProgress(raw.raisedAmount, raw.goalAmount),
    deadline: raw.deadline,
    status: raw.status as CampaignStatus,
    createdAt: raw.createdAt,
  };
}

/** Public org lookup payload from `organization_public(slug)` — only `id`/`name`
 *  are needed here (S2-07); the rest of that function's fields belong to the org
 *  profile portal, not this campaigns projection. */
interface RawPublicOrg {
  id: string;
  name: string;
}

function toPublicFromRow(row: CampaignRow, organizationName: string): CampaignPublic {
  return {
    id: row.id,
    organizationId: row.organizationId,
    organizationName,
    title: row.title,
    description: row.description ?? undefined,
    category: row.category as CampaignCategory,
    goalAmount: row.goalAmount,
    raisedAmount: row.raisedAmount,
    progress: computeProgress(row.raisedAmount, row.goalAmount),
    deadline: row.deadline.toISOString(),
    status: row.status as CampaignStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Public (no-session) campaign reads. Cross-tenant exposure goes through the
 * bounded SECURITY DEFINER functions (public_campaigns / public_campaign) — never
 * a raw RLS-evading select — so only public columns ever leave the DB.
 */
/** Raw public evidence row emitted by the accountability SECURITY DEFINER function. */
interface RawPublicEvidence {
  id: string;
  type: string;
  concept: string;
  amount: number | null;
  spentAt: string;
  storageRef: string;
  order: number;
}

/** Raw accountability payload from public_campaign_accountability. */
interface RawAccountability {
  campaign: RawPublicCampaign | null;
  evidences: RawPublicEvidence[] | null;
}

@Injectable()
export class PublicCampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    // Resolve the PUBLIC serve URL for each evidence file (StoragePort is a global
    // core provider; consumed by its token, read-only — no core edits).
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  /** Active campaigns across organizations (paginated, public columns only). */
  async list(limit: number, offset: number): Promise<Paginated<CampaignPublic>> {
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    const rows = await this.prisma.$queryRaw<
      Array<{ data: { items: RawPublicCampaign[]; total: number } }>
    >(Prisma.sql`SELECT public_campaigns(${take}::int, ${skip}::int) AS data`);
    const data = rows[0]?.data ?? { items: [], total: 0 };
    return {
      items: (data.items ?? []).map(toPublic),
      total: data.total ?? 0,
      limit: take,
      offset: skip,
    };
  }

  /**
   * Active campaigns of ONE organization, looked up by its public portal slug
   * (S2-07, RF15/RF16) — the `activeCampaign` section of the org public portal
   * (M14, @fabian). Same shape/pagination as {@link list} (the global feed), just
   * scoped to one org.
   *
   * No new SECURITY DEFINER function needed: this reuses the EXISTING
   * `organization_public(slug)` function (T-101, already granted to
   * `adoptafacil_app`) to resolve the slug → `{id, name}`, then reads `campaigns`
   * through `withOrgContext` — the same RLS-respecting, org-scoped accessor
   * `PublicAnimalsService.getPublicOrgDirectory` already uses to read one known
   * org's data from a public (no-session) route without evading RLS. Returns null
   * for an unknown slug (→ 404 at the controller), mirroring
   * `public/organizations/:slug/animals`.
   */
  async listByOrgSlug(
    slug: string,
    limit: number,
    offset: number,
  ): Promise<Paginated<CampaignPublic> | null> {
    const orgRows = await this.prisma.$queryRaw<Array<{ data: RawPublicOrg | null }>>(
      Prisma.sql`SELECT organization_public(${slug}) AS data`,
    );
    const org = orgRows[0]?.data;
    if (!org) {
      return null;
    }

    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    return this.prisma.withOrgContext(org.id, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.campaign.findMany({
          where: { organizationId: org.id, status: 'active' },
          orderBy: { createdAt: 'desc' },
          take,
          skip,
        }),
        tx.campaign.count({ where: { organizationId: org.id, status: 'active' } }),
      ]);
      return {
        items: rows.map((row) => toPublicFromRow(row, org.name)),
        total,
        limit: take,
        offset: skip,
      };
    });
  }

  /** One public campaign by id (active/closed only), or null. */
  async get(id: string): Promise<CampaignPublic | null> {
    const rows = await this.prisma.$queryRaw<Array<{ data: RawPublicCampaign | null }>>(
      Prisma.sql`SELECT public_campaign(${id}::uuid) AS data`,
    );
    const raw = rows[0]?.data ?? null;
    return raw ? toPublic(raw) : null;
  }

  /**
   * Public accountability report (RF16) for one campaign: the public campaign,
   * its public (non-deleted) evidences, and the SUM of declared spending. Served
   * only for NON-cancelled campaigns (the SECURITY DEFINER function enforces it);
   * returns null otherwise. Never exposes internal columns nor a fabricated
   * "executed %" (raised amount is wired in T-055).
   */
  async getAccountability(id: string): Promise<CampaignAccountabilityReport | null> {
    const rows = await this.prisma.$queryRaw<Array<{ data: RawAccountability | null }>>(
      Prisma.sql`SELECT public_campaign_accountability(${id}::uuid) AS data`,
    );
    const raw = rows[0]?.data ?? null;
    if (!raw || !raw.campaign) {
      return null;
    }
    const evidences: CampaignEvidencePublic[] = (raw.evidences ?? []).map((e) => ({
      id: e.id,
      type: e.type as CampaignEvidenceType,
      concept: e.concept,
      amount: e.amount ?? undefined,
      spentAt: e.spentAt,
      storageRef: e.storageRef,
      url: this.storage.resolvePublicUrl(e.storageRef),
      order: e.order,
    }));
    return {
      campaign: toPublic(raw.campaign),
      evidences,
      totalSpent: sumDeclaredSpending(evidences),
    };
  }
}

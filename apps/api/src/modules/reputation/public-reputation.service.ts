import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type OrganizationReputationSummary,
  type Paginated,
  type PublicReview,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_PAGE = 20;
const MAX_PAGE = 50;

function clampLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_PAGE;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE);
}

/** Raw row from `organization_public(slug)` (T-101) — only `id` used here. */
interface RawPublicOrg {
  id: string;
}

/**
 * Public reputation indicators (RF23 · M12) — no session required. Resolves
 * the org's slug via the EXISTING `organization_public` SECURITY DEFINER
 * function (T-101, same technique `PublicCampaignsService`/
 * `VolunteerOpportunitiesService.listPublicByOrgSlug` already use), then
 * reads through the new `organization_reputation_summary`/
 * `public_approved_reviews` SECURITY DEFINER functions — never through RLS,
 * since a public visitor has no tenant context.
 */
@Injectable()
export class PublicReputationService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveOrgId(slug: string): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<Array<{ data: RawPublicOrg | null }>>(
      Prisma.sql`SELECT organization_public(${slug}) AS data`,
    );
    return rows[0]?.data?.id ?? null;
  }

  async getSummaryByOrgSlug(slug: string): Promise<OrganizationReputationSummary | null> {
    const organizationId = await this.resolveOrgId(slug);
    if (!organizationId) return null;

    const rows = await this.prisma.$queryRaw<
      Array<{ average_rating: string | null; approved_review_count: number }>
    >(Prisma.sql`SELECT * FROM organization_reputation_summary(${organizationId}::uuid)`);
    return toSummary(organizationId, rows[0]);
  }

  async listApprovedByOrgSlug(
    slug: string,
    limit: number,
    offset: number,
  ): Promise<Paginated<PublicReview> | null> {
    const organizationId = await this.resolveOrgId(slug);
    if (!organizationId) return null;

    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    const rows = await this.prisma.$queryRaw<
      Array<{ data: { items: PublicReview[]; total: number } }>
    >(
      Prisma.sql`SELECT public_approved_reviews(${organizationId}::uuid, ${take}::int, ${skip}::int) AS data`,
    );
    const data = rows[0]?.data ?? { items: [], total: 0 };
    return {
      items: (data.items ?? []).map(toPublicReview),
      total: data.total ?? 0,
      limit: take,
      offset: skip,
    };
  }
}

/** The JSONB function stores a real SQL NULL for `authorName`/`comment` when
 *  absent — normalize to `undefined` so it never appears in the JSON
 *  response at all, matching the contract's documented "ausente" behavior
 *  (rather than serializing an explicit `null`). */
function toPublicReview(row: PublicReview): PublicReview {
  return {
    id: row.id,
    rating: row.rating,
    comment: row.comment ?? undefined,
    authorName: row.authorName ?? undefined,
    createdAt: row.createdAt,
  };
}

/** `average_rating` comes back as a string (Postgres NUMERIC) or null (zero
 *  approved reviews) — default it to 0 rather than surfacing NaN/null. */
export function toSummary(
  organizationId: string,
  row: { average_rating: string | null; approved_review_count: number } | undefined,
): OrganizationReputationSummary {
  return {
    organizationId,
    averageRating: row?.average_rating ? Number(row.average_rating) : 0,
    approvedReviewsCount: row?.approved_review_count ?? 0,
  };
}

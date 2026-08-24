import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OrganizationDuplicateMatch } from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Default trigram-similarity threshold (0..1) above which two organization
 * names are flagged as a possible duplicate. The base document does not fix
 * an exact value — 0.4 is `pg_trgm`'s own documented "clearly related"
 * ballpark (its own default GUC is 0.3, chosen here slightly higher to keep
 * false positives low until real data is observed). Overridable via
 * `ORG_NAME_SIMILARITY_THRESHOLD` without a redeploy — TODO(client): tune
 * once real organization names are seen in production.
 */
const DEFAULT_SIMILARITY_THRESHOLD = 0.4;

function similarityThreshold(): number {
  const raw = process.env.ORG_NAME_SIMILARITY_THRESHOLD;
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1
    ? parsed
    : DEFAULT_SIMILARITY_THRESHOLD;
}

export interface OrganizationNitConflict {
  organizationId: string;
  organizationName: string;
}

/**
 * S-3 duplicate-organization detection (risk-table §16 "Captación ilegal /
 * LA-FT" mitigation — no explicit RF). Two independent signals:
 *  - Exact NIT match: a HARD rule (the NIT is a unique legal id in Colombia,
 *    art. 125-3 ET — same reference as S-1/RF14). `organization_profiles` is
 *    RLS-scoped, so a cross-tenant lookup goes through the bounded
 *    `find_organization_by_nit` SECURITY DEFINER function (same pattern as
 *    `organization_public`/`legal_representative_summary`).
 *  - Fuzzy name match (`pg_trgm` trigram similarity): `organizations.name`
 *    lives on the tenant registry table, which is intentionally NOT under
 *    RLS (it is already effectively cross-tenant-readable — the public
 *    catalog already merges org names/cities from every tenant), so this
 *    runs as a plain query, no SECURITY DEFINER needed.
 */
@Injectable()
export class DuplicateDetectionService {
  constructor(private readonly prisma: PrismaService) {}

  /** At most one OTHER organization (never the caller's own) currently
   *  holding this exact NIT, or `null` if none. */
  async findNitConflict(
    organizationId: string,
    nit: string,
  ): Promise<OrganizationNitConflict | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{ organization_id: string; organization_name: string }>
    >(Prisma.sql`SELECT * FROM find_organization_by_nit(${nit}, ${organizationId}::uuid)`);
    const row = rows[0];
    return row
      ? { organizationId: row.organization_id, organizationName: row.organization_name }
      : null;
  }

  /** Other organizations whose name is similar enough to `name` to warrant a
   *  review flag — never blocks, only informs. Ordered by similarity, most
   *  similar first. */
  async findSimilarNames(
    organizationId: string,
    name: string,
  ): Promise<OrganizationDuplicateMatch[]> {
    const threshold = similarityThreshold();
    const rows = await this.prisma.$queryRaw<Array<{ id: string; name: string; score: number }>>(
      Prisma.sql`
        SELECT id, name, similarity(name, ${name}) AS score
        FROM organizations
        WHERE id <> ${organizationId}::uuid
          AND similarity(name, ${name}) >= ${threshold}
        ORDER BY score DESC
        LIMIT 10
      `,
    );
    return rows.map((row) => ({
      organizationId: row.id,
      organizationName: row.name,
      similarityScore: row.score,
    }));
  }
}

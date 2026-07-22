import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  PortalTheme,
  PortalThemeConfig,
  UpdatePortalThemeInput,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';

/**
 * M14 portal theme (T-027). The theme is tenant-scoped: an org reads/edits only
 * its own row (RLS). The PUBLIC read goes through the `organization_portal_theme`
 * SECURITY DEFINER function so a visitor with no tenant context gets the (public)
 * tokens without evading RLS. Token VALIDATION happens at the controller boundary
 * (Zod, see portals.schemas.ts) — only the safe, validated subset ever lands here.
 */
@Injectable()
export class PortalThemeService {
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

  /** The caller's own theme (empty tokens when none saved yet). */
  async getOwnTheme(): Promise<PortalThemeConfig> {
    const organizationId = this.requireOrgId();
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const row = await tx.portalTheme.findUnique({ where: { organizationId } });
      return { tokens: (row?.tokens as PortalTheme | undefined) ?? {} };
    });
  }

  /** Create/patch the caller's theme (Owner/Administrator). Persists the validated
   *  tokens and records an audit event, all in one RLS-scoped transaction. */
  async updateTheme(
    actorUserId: string,
    input: UpdatePortalThemeInput,
  ): Promise<PortalThemeConfig> {
    const organizationId = this.requireOrgId();
    const tokens = input.tokens as unknown as Prisma.InputJsonValue;

    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const row = await tx.portalTheme.upsert({
        where: { organizationId },
        create: { organizationId, tokens },
        update: { tokens },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'portal.theme_updated',
        entityType: 'portal_theme',
        entityId: organizationId,
        // Only WHICH tokens changed — never full values (branding is low-risk but
        // we keep the audit metadata minimal and consistent with org profile).
        metadata: { tokens: Object.keys(input.tokens) },
      });
      return { tokens: (row.tokens as PortalTheme) ?? {} };
    });
  }

  /**
   * Public theme by slug. Reads through the `organization_portal_theme` SECURITY
   * DEFINER function (public tokens only, no tenant context needed, RLS not
   * evaded). Returns empty tokens when the org has no theme or the slug is unknown
   * — the portal then simply renders the design-system default.
   */
  async getPublicBySlug(slug: string): Promise<PortalThemeConfig> {
    const rows = await this.prisma.$queryRaw<Array<{ tokens: PortalTheme | null }>>(
      Prisma.sql`SELECT organization_portal_theme(${slug}) AS tokens`,
    );
    return { tokens: rows[0]?.tokens ?? {} };
  }
}

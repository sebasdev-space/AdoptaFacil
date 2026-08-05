import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  PortalLogoPosition,
  PortalSocialNavPosition,
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
      return {
        tokens: (row?.tokens as PortalTheme | undefined) ?? {},
        logoPosition: (row?.logoPosition as PortalLogoPosition | null) ?? undefined,
        socialNavPosition: (row?.socialNavPosition as PortalSocialNavPosition | null) ?? undefined,
      };
    });
  }

  /** Create/patch the caller's theme (Owner/Administrator). Persists the validated
   *  tokens (+ layout positions, S2-PORTAL) and records an audit event, all in one
   *  RLS-scoped transaction. `logoPosition`/`socialNavPosition` are independent of
   *  `tokens` — omitting one leaves its stored value untouched. */
  async updateTheme(
    actorUserId: string,
    input: UpdatePortalThemeInput,
  ): Promise<PortalThemeConfig> {
    const organizationId = this.requireOrgId();
    const tokens = input.tokens as unknown as Prisma.InputJsonValue;

    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const row = await tx.portalTheme.upsert({
        where: { organizationId },
        create: {
          organizationId,
          tokens,
          ...(input.logoPosition !== undefined ? { logoPosition: input.logoPosition } : {}),
          ...(input.socialNavPosition !== undefined
            ? { socialNavPosition: input.socialNavPosition }
            : {}),
        },
        update: {
          tokens,
          ...(input.logoPosition !== undefined ? { logoPosition: input.logoPosition } : {}),
          ...(input.socialNavPosition !== undefined
            ? { socialNavPosition: input.socialNavPosition }
            : {}),
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'portal.theme_updated',
        entityType: 'portal_theme',
        entityId: organizationId,
        // Only WHICH tokens/fields changed — never full values (branding is
        // low-risk but we keep the audit metadata minimal and consistent).
        metadata: {
          tokens: Object.keys(input.tokens),
          layout: [
            ...(input.logoPosition !== undefined ? ['logoPosition'] : []),
            ...(input.socialNavPosition !== undefined ? ['socialNavPosition'] : []),
          ],
        },
      });
      return {
        tokens: (row.tokens as PortalTheme) ?? {},
        logoPosition: (row.logoPosition as PortalLogoPosition | null) ?? undefined,
        socialNavPosition: (row.socialNavPosition as PortalSocialNavPosition | null) ?? undefined,
      };
    });
  }

  /**
   * Public theme by slug. Reads through the `organization_portal_theme` SECURITY
   * DEFINER function (public tokens + layout only, no tenant context needed, RLS
   * not evaded). Returns the defaults when the org has no theme or the slug is
   * unknown — the portal then simply renders the design-system default layout.
   */
  async getPublicBySlug(slug: string): Promise<PortalThemeConfig> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        data: {
          tokens: PortalTheme;
          logoPosition: PortalLogoPosition;
          socialNavPosition: PortalSocialNavPosition;
        } | null;
      }>
    >(Prisma.sql`SELECT organization_portal_theme(${slug}) AS data`);
    const data = rows[0]?.data;
    return {
      tokens: data?.tokens ?? {},
      logoPosition: data?.logoPosition ?? 'left',
      socialNavPosition: data?.socialNavPosition ?? 'right',
    };
  }
}

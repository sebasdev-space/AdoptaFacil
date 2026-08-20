import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * M14 · resolve a real portal subdomain (`<subdomain>.adoptafacil.com`) to its
 * organization slug. Reads through the `organization_slug_by_subdomain`
 * SECURITY DEFINER function (same pattern as `organization_public`/
 * `organization_portal_theme`, T-portal-personalization-v2): no tenant context
 * needed, RLS not evaded, and the public surface is the single narrowest field
 * possible (the slug) — the caller then reuses every existing slug-keyed
 * public endpoint unchanged.
 */
@Injectable()
export class PortalSubdomainService {
  constructor(private readonly prisma: PrismaService) {}

  /** The org's slug for `subdomain`, or `null` when no organization has it. */
  async getSlugBySubdomain(subdomain: string): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<Array<{ slug: string | null }>>(
      Prisma.sql`SELECT organization_slug_by_subdomain(${subdomain}) AS slug`,
    );
    return rows[0]?.slug ?? null;
  }
}

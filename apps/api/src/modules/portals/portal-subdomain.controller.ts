import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import type { OrganizationSlugLookup } from '@adoptafacil/contracts';
import { PortalSubdomainService } from './portal-subdomain.service';

/**
 * M14 · resolve a real portal subdomain to its organization slug. PUBLIC (no
 * auth) and deliberately narrow: returns only `{ slug }`, never organization
 * data itself — the frontend then re-fetches through the existing
 * slug-keyed public endpoints (`/public/organizations/:slug`, `.../theme`,
 * etc.), so this route never becomes a second, diverging public projection.
 */
@Controller()
export class PortalSubdomainController {
  constructor(private readonly subdomains: PortalSubdomainService) {}

  @Get('public/organizations/by-subdomain/:subdomain')
  async getSlug(@Param('subdomain') subdomain: string): Promise<OrganizationSlugLookup> {
    const slug = await this.subdomains.getSlugBySubdomain(subdomain);
    if (!slug) {
      throw new NotFoundException('No organization has this subdomain');
    }
    return { slug };
  }
}

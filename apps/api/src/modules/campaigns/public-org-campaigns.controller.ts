import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import type { CampaignPublic, Paginated } from '@adoptafacil/contracts';
import { PublicCampaignsService } from './public-campaigns.service';

/**
 * PUBLIC per-organization campaign feed (S2-07, M06, RF15/RF16). No
 * authentication: exposes only the ACTIVE campaigns of ONE organization, looked
 * up by its public portal slug, through the existing `organization_public`
 * SECURITY DEFINER function (see {@link PublicCampaignsService.listByOrgSlug}) —
 * never a raw cross-tenant select. Same shape as `GET /public/campaigns`
 * (global), same pagination cap. Mirrors
 * `GET /public/organizations/:slug/animals` (T-029).
 *
 * Separate controller (no shared `@Controller('public/campaigns')` prefix)
 * because the route lives under `public/organizations/:slug`, not
 * `public/campaigns`.
 */
@Controller()
export class PublicOrgCampaignsController {
  constructor(private readonly service: PublicCampaignsService) {}

  @Get('public/organizations/:slug/campaigns')
  async list(
    @Param('slug') slug: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<Paginated<CampaignPublic>> {
    const page = await this.service.listByOrgSlug(slug, Number(limit), Number(offset));
    if (!page) {
      throw new NotFoundException('Organization not found');
    }
    return page;
  }
}

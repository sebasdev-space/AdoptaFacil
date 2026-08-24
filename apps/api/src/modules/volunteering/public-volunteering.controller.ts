import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import type { Paginated, VolunteerOpportunityPublic } from '@adoptafacil/contracts';
import { VolunteerOpportunitiesService } from './volunteer-opportunities.service';

/**
 * PUBLIC per-organization volunteer opportunity feed (RF18). No
 * authentication: exposes only ACTIVE opportunities of ONE organization,
 * looked up by its public portal slug. Separate controller (no shared
 * `@Controller` prefix with the internal one) because the route lives under
 * `public/organizations/:slug`, same convention as
 * `GET /public/organizations/:slug/campaigns` (S2-07).
 */
@Controller()
export class PublicVolunteeringController {
  constructor(private readonly service: VolunteerOpportunitiesService) {}

  /** Global feed (all organizations) — same pattern as `GET /public/campaigns`. */
  @Get('public/volunteer-opportunities')
  listGlobal(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<Paginated<VolunteerOpportunityPublic>> {
    return this.service.listPublic(Number(limit), Number(offset));
  }

  @Get('public/organizations/:slug/volunteer-opportunities')
  async list(
    @Param('slug') slug: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<Paginated<VolunteerOpportunityPublic>> {
    const page = await this.service.listPublicByOrgSlug(slug, Number(limit), Number(offset));
    if (!page) {
      throw new NotFoundException('Organization not found');
    }
    return page;
  }
}

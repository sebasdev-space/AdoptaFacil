import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import {
  type OrganizationReputationSummary,
  type Paginated,
  type PublicReview,
} from '@adoptafacil/contracts';
import { PublicReputationService } from './public-reputation.service';

/**
 * Public reputation indicators (RF23 · M12) — NO auth, mirrors
 * `PublicOrgCampaignsController`/M08's `public-volunteering.controller.ts`
 * (empty controller prefix, explicit `public/...` path per route).
 */
@Controller()
export class PublicReputationController {
  constructor(private readonly service: PublicReputationService) {}

  @Get('public/organizations/:slug/reputation-summary')
  async summary(@Param('slug') slug: string): Promise<OrganizationReputationSummary> {
    const summary = await this.service.getSummaryByOrgSlug(slug);
    if (!summary) {
      throw new NotFoundException('Organization not found');
    }
    return summary;
  }

  @Get('public/organizations/:slug/reviews')
  async reviews(
    @Param('slug') slug: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<Paginated<PublicReview>> {
    const page = await this.service.listApprovedByOrgSlug(slug, Number(limit), Number(offset));
    if (!page) {
      throw new NotFoundException('Organization not found');
    }
    return page;
  }
}

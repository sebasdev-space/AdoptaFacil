import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  type CampaignAccountabilityReport,
  type CampaignPublic,
  type Paginated,
} from '@adoptafacil/contracts';
import { PublicCampaignsService } from './public-campaigns.service';

/**
 * PUBLIC campaign portal (M14) — NO authentication, public columns only, served
 * through bounded SECURITY DEFINER functions. Lists active campaigns across
 * organizations and exposes a single campaign's public detail.
 */
@Controller('public/campaigns')
export class PublicCampaignsController {
  constructor(private readonly service: PublicCampaignsService) {}

  @Get()
  list(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<Paginated<CampaignPublic>> {
    return this.service.list(Number(limit), Number(offset));
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<CampaignPublic> {
    const campaign = await this.service.get(id);
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    return campaign;
  }

  /**
   * Public accountability report (RF16): what the campaign declared it spent,
   * with the evidences. No session; cancelled campaigns → 404.
   */
  @Get(':id/accountability')
  async accountability(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CampaignAccountabilityReport> {
    const report = await this.service.getAccountability(id);
    if (!report) {
      throw new NotFoundException('Campaign not found');
    }
    return report;
  }
}

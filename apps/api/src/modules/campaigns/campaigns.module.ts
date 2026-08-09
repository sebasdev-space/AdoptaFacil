import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { CampaignEvidencesController } from './campaign-evidences.controller';
import { CampaignEvidencesService } from './campaign-evidences.service';
import { CampaignFundingController } from './campaign-funding.controller';
import { CampaignFundingService } from './campaign-funding.service';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { PublicCampaignsController } from './public-campaigns.controller';
import { PublicCampaignsService } from './public-campaigns.service';
import { PublicOrgCampaignsController } from './public-org-campaigns.controller';

/**
 * M06 · Fundraising campaigns (RF15) + accountability evidences (RF16, T-054) +
 * REAL funding from approved donations (RF15 progress, T-055): tenant-scoped CRUD
 * (Owner/Administrator/Operator) + public portal exposure via bounded SECURITY
 * DEFINER functions. Consumes core (tenant/auth/rbac/audit/storage) and M05
 * donations data (read-only, via bounded functions); AuthModule is imported for
 * the JwtAuthGuard. The commission math stays in the PaymentPort/computeBreakdown
 * (single source) — never recomputed here.
 */
@Module({
  imports: [AuthModule],
  controllers: [
    CampaignsController,
    CampaignEvidencesController,
    CampaignFundingController,
    PublicCampaignsController,
    PublicOrgCampaignsController,
  ],
  providers: [
    CampaignsService,
    CampaignEvidencesService,
    CampaignFundingService,
    PublicCampaignsService,
  ],
  exports: [CampaignFundingService],
})
export class CampaignsModule {}

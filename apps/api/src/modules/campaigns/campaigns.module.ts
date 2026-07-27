import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { CampaignEvidencesController } from './campaign-evidences.controller';
import { CampaignEvidencesService } from './campaign-evidences.service';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { PublicCampaignsController } from './public-campaigns.controller';
import { PublicCampaignsService } from './public-campaigns.service';

/**
 * M06 · Fundraising campaigns (RF15) + accountability evidences (RF16, T-054):
 * tenant-scoped CRUD (Owner/Administrator/Operator) + public portal exposure via
 * bounded SECURITY DEFINER functions. Consumes core (tenant/auth/rbac/audit/
 * storage) — global providers; AuthModule is imported for the JwtAuthGuard. No
 * money handling here (PaymentPort = T-055).
 */
@Module({
  imports: [AuthModule],
  controllers: [CampaignsController, CampaignEvidencesController, PublicCampaignsController],
  providers: [CampaignsService, CampaignEvidencesService, PublicCampaignsService],
})
export class CampaignsModule {}

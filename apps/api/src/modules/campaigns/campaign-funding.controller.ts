import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { type CampaignFundingReconcileResult, Role } from '@adoptafacil/contracts';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { CampaignFundingService } from './campaign-funding.service';

/** Roles that may trigger a funding reconcile — same as campaign management. */
const MANAGE_ROLES = [Role.Owner, Role.Administrator, Role.Operator] as const;

/**
 * M06 campaign funding (RF15 · T-055). Authenticated self-service reconcile: pull
 * this org's APPROVED campaign donations into the campaigns' real raisedAmount
 * (idempotent). Deny-by-default (org management roles only). The primary trigger
 * is the donations webhook calling {@link CampaignFundingService.applyApprovedCollection}
 * per collection — see the HANDOFF note in the service.
 */
@Controller('campaigns/funding')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CampaignFundingController {
  constructor(private readonly service: CampaignFundingService) {}

  @Post('reconcile')
  @HttpCode(200)
  @Roles(...MANAGE_ROLES)
  reconcile(): Promise<CampaignFundingReconcileResult> {
    return this.service.reconcileMyOrg();
  }
}

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Role, type PayoutView, type RequestPayoutInput } from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { PayoutsService } from './payouts.service';
import { requestPayoutSchema } from './payouts.schemas';

/** Dispersión T+1 is a treasury operation — PlatformAdmin/PlatformSuperAdmin
 *  only (an org never self-triggers its own payout in Ola 1). */
const PLATFORM_ROLES = [Role.PlatformAdmin, Role.PlatformSuperAdmin] as const;

/**
 * M15b payouts (RF26). Two audiences:
 *   - PlatformAdmin/PlatformSuperAdmin trigger and inspect payouts
 *     (`/platform/payouts`) — deny-by-default, guarded per-route (NOT at the
 *     class level, same reasoning as `DonationsController`: the webhook route
 *     below must stay PUBLIC, so it cannot share a class-level guard);
 *   - the GATEWAY posts a confirmation webhook (`/payments/payouts/webhook`)
 *     — PUBLIC (no JWT), signature-verified and idempotent.
 */
@Controller()
export class PayoutsController {
  constructor(private readonly service: PayoutsService) {}

  @Post('platform/payouts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...PLATFORM_ROLES)
  request(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(requestPayoutSchema)) dto: RequestPayoutInput,
  ): Promise<PayoutView> {
    return this.service.requestPayout(actor.id, dto.organizationId, dto.amount, dto.idempotencyKey);
  }

  @Get('platform/payouts/:organizationId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...PLATFORM_ROLES)
  listForOrganization(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ): Promise<PayoutView[]> {
    return this.service.listForOrganization(organizationId);
  }

  @Post('payments/payouts/webhook')
  @HttpCode(200)
  applyWebhook(
    @Body() payload: unknown,
    @Headers('x-payment-signature') signature?: string,
  ): Promise<void> {
    return this.service.applyWebhook(payload, signature ?? '');
  }
}

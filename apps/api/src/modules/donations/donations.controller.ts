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
import {
  Role,
  type CreateDonationInput,
  type Donation,
  type DonationReceipt,
  type DonationWithReceipt,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { DonationsService, type WebhookOutcome } from './donations.service';
import { createDonationSchema } from './donations.schemas';

/** Roles that VIEW the org's received donations/receipts (§13) — org set
 *  (Owner/Administrator/Operator), NOT the platform admin. */
const MANAGE_ROLES = [Role.Owner, Role.Administrator, Role.Operator] as const;

/**
 * M05 donations (T-050, P1). Audiences:
 *   - a PERSON creates a donation (`POST /donations`) — any authenticated user;
 *   - the same donor lists their donations / fetches their receipt (cross-tenant,
 *     by identity, via SECURITY DEFINER);
 *   - the BENEFICIARY organization lists its received donations (deny-by-default,
 *     MANAGE_ROLES only), RLS-scoped;
 *   - the GATEWAY posts a webhook (`POST /donations/webhook`) — PUBLIC (no JWT);
 *     the PaymentPort verifies the signature and the settlement is idempotent.
 * All donation rows are tenant-scoped (RLS).
 */
@Controller('donations')
export class DonationsController {
  constructor(private readonly service: DonationsService) {}

  /** Create a donation (authenticated person). */
  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(createDonationSchema)) dto: CreateDonationInput,
  ): Promise<Donation> {
    return this.service.create(actor, dto);
  }

  /** The beneficiary org's received donations with their receipts. */
  @Get('received')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...MANAGE_ROLES)
  listReceived(): Promise<DonationWithReceipt[]> {
    return this.service.listReceived();
  }

  /** The donor's own donations (cross-tenant, by identity). */
  @Get('mine')
  @UseGuards(JwtAuthGuard)
  listMine(@CurrentUser() actor: RequestUser): Promise<Donation[]> {
    return this.service.listMine(actor);
  }

  /** The donor's receipt for THEIR OWN donation. */
  @Get(':id/receipt')
  @UseGuards(JwtAuthGuard)
  getReceipt(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DonationReceipt> {
    return this.service.getReceiptForDonor(actor, id);
  }

  /**
   * Gateway webhook (PUBLIC — no JWT). The body is the raw gateway payload; the
   * signature travels in the `x-payment-signature` header. The PaymentPort verifies
   * and normalizes it, and the settlement + receipt are idempotent (dedup by event).
   */
  @Post('webhook')
  @HttpCode(200)
  applyWebhook(
    @Body() payload: unknown,
    @Headers('x-payment-signature') signature?: string,
  ): Promise<WebhookOutcome> {
    return this.service.applyWebhook(payload, signature ?? '');
  }
}

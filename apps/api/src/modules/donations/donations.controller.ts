import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  Role,
  type CreateDonationInput,
  type Donation,
  type DonationCertificate,
  type DonationReceipt,
  type DonationWithReceipt,
  type WebhookVerificationContext,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../core/auth/optional-jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { DonationsService, type WebhookOutcome } from './donations.service';
import { DonationCertificatesService } from './donation-certificates.service';
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
  constructor(
    private readonly service: DonationsService,
    private readonly certificates: DonationCertificatesService,
  ) {}

  /**
   * Create a donation — a PERSON (authenticated) OR a GUEST (no account/login,
   * client requirement: donating must never be gated behind a login wall).
   * `OptionalJwtAuthGuard` never rejects the request; it links the donation to
   * an account ONLY when a valid bearer token is present, same as MercadoPago
   * Checkout Pro's own guest-checkout support.
   */
  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  create(
    @CurrentUser() actor: RequestUser | undefined,
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
   * The donor's certificate for THEIR OWN donation (F-3, RF14). 404 covers
   * three cases on purpose (never distinguished to the caller, same as
   * `getReceipt`): not the donor, not yet approved, or the beneficiary
   * organization isn't an ESAL with RTE vigente (so nothing was ever issued).
   */
  @Get(':id/certificate')
  @UseGuards(JwtAuthGuard)
  getCertificate(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DonationCertificate> {
    return this.certificates.getForDonor(id, actor.id);
  }

  /**
   * The ORGANIZATION generates (or re-opens) the certificate of one of its
   * approved donations — for donations whose certificate was never issued
   * (e.g. the org became ESAL-RTE after the payment). Same certificate if it
   * already exists; 422 if not eligible / not approved. Management roles only.
   */
  @Post(':id/certificate')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...MANAGE_ROLES)
  generateCertificate(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DonationCertificate> {
    return this.service.generateCertificate(actor, id);
  }

  /**
   * Gateway webhook (PUBLIC — no JWT). The body is the raw gateway payload; the
   * signature travels in the `x-signature` header (MercadoPago's `ts=...,v1=...`
   * format). `x-request-id` and the `data.id` query param are ALSO required to
   * build MercadoPago's signature manifest — bundled into `context` and passed
   * through untouched. The PaymentPort verifies and normalizes it, and the
   * settlement + receipt are idempotent (dedup by event).
   */
  @Post('webhook')
  @HttpCode(200)
  applyWebhook(
    @Body() payload: unknown,
    @Headers('x-signature') signature: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Query() query: Record<string, string | undefined>,
  ): Promise<WebhookOutcome> {
    const context: WebhookVerificationContext = {
      headers: { 'x-request-id': requestId },
      query,
    };
    return this.service.applyWebhook(payload, signature ?? '', context);
  }
}

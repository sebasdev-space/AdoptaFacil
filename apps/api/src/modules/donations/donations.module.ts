import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { DonationsController } from './donations.controller';
import { DonationsService } from './donations.service';
import { DonationCertificatePublicController } from './donation-certificate-public.controller';
import { DonationCertificatesService } from './donation-certificates.service';

/**
 * M05 · Donations (T-050, P1). A Person donates to an organization, sees the
 * transparent breakdown before paying (via M15's `computeBreakdown`), the collection
 * is processed through the PaymentPort, and on approval an automatic receipt is
 * emitted. Consumes core (tenant/rbac/audit are global) and imports AuthModule for
 * the JwtAuthGuard. Owns the `donations`/`donation_receipts` tables (RLS) and their
 * SECURITY DEFINER cross-tenant writes/reads.
 *
 * PaymentPort: consumed from the GLOBAL `PAYMENT_PORT` provider (core `PaymentModule`,
 * @Global, T-052/T-054). No local binding — the service injects the token directly.
 * The adapter (fake / future Wompi) is chosen there via `PAYMENT_DRIVER`.
 *
 * CampaignsModule (T-057): imported ONLY to consume its exported
 * `CampaignFundingService` — the webhook enganche calls
 * `applyApprovedCollection(collectionId)` for campaign-concept donations. No
 * campaigns internals are touched; this module owns no campaign logic.
 *
 * `DonationCertificatesService` (F-3, RF14): the certificate is issued
 * automatically inside the same webhook approval, best-effort (never fails
 * the webhook), only when the beneficiary org is an ESAL with RTE vigente.
 * Owns `donation_certificates` (RLS + immutable) and its two SECURITY
 * DEFINER reads (donor, cross-tenant; and public, by code — no auth).
 */
@Module({
  imports: [AuthModule, CampaignsModule],
  controllers: [DonationsController, DonationCertificatePublicController],
  providers: [DonationsService, DonationCertificatesService],
})
export class DonationsModule {}

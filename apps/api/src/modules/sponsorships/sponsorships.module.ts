import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { PublicSponsorshipsController } from './public-sponsorships.controller';
import { PublicSponsorshipsService } from './public-sponsorships.service';
import { SPONSORSHIP_BILLING_QUEUE } from './sponsorship-billing.constants';
import { SponsorshipBillingProcessor } from './sponsorship-billing.processor';
import { SponsorshipBillingScheduler } from './sponsorship-billing.scheduler';
import { SponsorshipBillingService } from './sponsorship-billing.service';
import { SponsorshipPaymentPollerService } from './sponsorship-payment-poller.service';
import { SponsorshipPaymentsService } from './sponsorship-payments.service';
import { SponsorshipPlansController } from './sponsorship-plans.controller';
import { SponsorshipPlansService } from './sponsorship-plans.service';
import { SponsorshipsController } from './sponsorships.controller';
import { SponsorshipsService } from './sponsorships.service';

/**
 * M07 · Recurring sponsorships (RF17). Base slice (T-056): plans (tenant-
 * scoped CRUD, Owner/Administrator) + subscriptions (any authenticated
 * Person, cross-tenant via a bounded SECURITY DEFINER function) + lifecycle
 * (suspend/reactivate/cancel, Owner/Administrator) + immutable history, plus
 * an optional public portal summary via bounded SECURITY DEFINER exposure.
 *
 * S-5-REDISEÑO (T-057) adds recurring BILLING: the gateway only supports
 * one-shot payment links (no card tokenization), so a repeatable BullMQ job
 * (`BullModule.registerQueue` on the shared global QueueModule↔Redis
 * connection, same mechanism as `AnimalsModule`'s `REMINDERS_QUEUE` — no
 * change to that shared queue infra) drives a tolerant reminder/retry ladder
 * (up to 3 attempts) before auto-suspending, and a SEPARATE poller confirms
 * payment via `PaymentPort.getCollectionStatus()` (not the gateway webhook —
 * see `sponsorship-payment-poller.service.ts`'s header comment). Consumes
 * core (tenant/auth/rbac/audit/payments/notifications) — global providers;
 * AuthModule is imported for the JwtAuthGuard.
 */
@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: SPONSORSHIP_BILLING_QUEUE })],
  controllers: [SponsorshipPlansController, SponsorshipsController, PublicSponsorshipsController],
  providers: [
    SponsorshipPlansService,
    SponsorshipsService,
    PublicSponsorshipsService,
    SponsorshipPaymentsService,
    SponsorshipBillingService,
    SponsorshipPaymentPollerService,
    SponsorshipBillingScheduler,
    SponsorshipBillingProcessor,
  ],
})
export class SponsorshipsModule {}

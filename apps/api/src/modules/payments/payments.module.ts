import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { MercadoPagoOAuthClient } from '../../core/payments/mercadopago-oauth.client';
import { BankAccountsController } from './bank-accounts.controller';
import { BankAccountsService } from './bank-accounts.service';
import { MercadoPagoConnectController } from './mercadopago-connect.controller';
import { MercadoPagoConnectService } from './mercadopago-connect.service';
import { MercadoPagoTokenRefreshProcessor } from './mercadopago-token-refresh.processor';
import { MercadoPagoTokenRefreshScheduler } from './mercadopago-token-refresh.scheduler';
import { MERCADOPAGO_TOKEN_REFRESH_QUEUE } from './mercadopago-connect.constants';
import { PayoutsController } from './payouts.controller';
import { PayoutsProcessor } from './payouts.processor';
import { PayoutsService } from './payouts.service';
import { PAYOUTS_QUEUE } from './payouts.constants';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';

/**
 * M15b · Dispersión T+1 (RF26) — Fase 2, BLOQUEADA (pendiente aprobación de
 * Disbursements de MercadoPago; el diseño original apuntaba a Wompi Payouts,
 * ya reemplazado). Owns:
 *   - `organization_bank_accounts` (RLS) — the org's own registered payout
 *     destination (Owner/Administrator self-service, `/org/payout-bank-account`).
 *   - `payouts` (RLS) — one row per dispersión attempt, dispatched through a
 *     BullMQ worker (staggered retry on gateway failure) and settled by the
 *     gateway's payout webhook (`/payments/payouts/webhook`, public).
 *   - `/platform/payouts` — PlatformAdmin/PlatformSuperAdmin trigger + inspect
 *     (treasury operation; an org never self-triggers its own payout).
 *   - `/platform/reconciliation` (F-5, RF26) — read-only report crossing
 *     recaudo (donations) vs. dispersión (payouts), by org and calendar
 *     month; no table of its own, aggregates over the two above.
 *   - `organization_mercadopago_accounts` (RLS, T-OAuth-Connect) — Split de
 *     Pagos 1:1: an org connects its OWN MercadoPago account via OAuth
 *     (`/org/mercadopago/connect|callback|status`, Owner/Administrator +
 *     one public callback route) plus a daily BullMQ token-refresh scan. This
 *     is ONLY the connect infra — wiring the connected `mpUserId` into an
 *     actual split payment at checkout is a separate follow-up, not here.
 *
 * PaymentPort: consumed from the GLOBAL `PAYMENT_PORT` provider (core
 * `PaymentModule`, @Global) — no local binding, same convention as
 * `DonationsModule`. The BullMQ queue runs on the reusable global
 * BullMQ↔Redis connection (`QueueModule`, @Global).
 */
@Module({
  imports: [
    AuthModule,
    BullModule.registerQueue({ name: PAYOUTS_QUEUE }),
    BullModule.registerQueue({ name: MERCADOPAGO_TOKEN_REFRESH_QUEUE }),
  ],
  controllers: [
    BankAccountsController,
    PayoutsController,
    ReconciliationController,
    MercadoPagoConnectController,
  ],
  providers: [
    BankAccountsService,
    PayoutsService,
    PayoutsProcessor,
    ReconciliationService,
    MercadoPagoOAuthClient,
    MercadoPagoConnectService,
    MercadoPagoTokenRefreshScheduler,
    MercadoPagoTokenRefreshProcessor,
  ],
})
export class PaymentsModule {}

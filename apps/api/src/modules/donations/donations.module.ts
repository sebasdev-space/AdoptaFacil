import { Module } from '@nestjs/common';
import { FakePaymentAdapter } from '@adoptafacil/contracts';
import { AuthModule } from '../../core/auth/auth.module';
import { DonationsController } from './donations.controller';
import { DonationsService } from './donations.service';
import { PAYMENT_PORT } from './payment.token';

/**
 * M05 · Donations (T-050, P1). A Person donates to an organization, sees the
 * transparent breakdown before paying (via M15's `computeBreakdown`), the collection
 * is processed through the PaymentPort, and on approval an automatic receipt is
 * emitted. Consumes core (tenant/rbac/audit are global) and imports AuthModule for
 * the JwtAuthGuard. Owns the `donations`/`donation_receipts` tables (RLS) and their
 * SECURITY DEFINER cross-tenant writes/reads.
 *
 * PaymentPort binding: the GLOBAL `PAYMENT_PORT` token (with the real Wompi adapter)
 * is Sebastián's core/ task and does NOT exist yet. Until then M05 binds the
 * simulable `FakePaymentAdapter` from `@adoptafacil/contracts` to a LOCAL token
 * (see payment.token.ts) — core/ is untouched. Swapping to the global token later is
 * a one-line change; the service (which injects the token) stays the same.
 */
@Module({
  imports: [AuthModule],
  controllers: [DonationsController],
  providers: [DonationsService, { provide: PAYMENT_PORT, useClass: FakePaymentAdapter }],
})
export class DonationsModule {}

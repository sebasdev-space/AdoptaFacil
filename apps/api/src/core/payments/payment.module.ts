import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FakePaymentAdapter } from '@adoptafacil/contracts';
import { PAYMENT_PORT } from './payment.port';

/**
 * Shared PaymentPort provider (T-052). Global so any module injects PAYMENT_PORT
 * without re-binding it — mirrors STORAGE_PORT / NOTIFICATION_PORT (T-107).
 *
 * The adapter is chosen by PAYMENT_DRIVER ('fake' by default). The Fake adapter
 * is IMPORTED from @adoptafacil/contracts (dependency-free, deterministic) — NOT
 * copied here, so Fabián's `computeBreakdown` stays the single source of the
 * commission math. Swapping to the real gateway = one line below.
 */
@Global()
@Module({
  providers: [
    {
      provide: PAYMENT_PORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const driver = config.get<string>('PAYMENT_DRIVER') ?? 'fake';
        if (driver === 'wompi') {
          // TODO(M15): return new WompiPaymentAdapter(...) — real gateway
          // (recaudo consolidado + dispersión T+1), Fabián's M15 implementation.
          // Wiring point is HERE: no consumer changes when it lands.
          throw new Error('PAYMENT_DRIVER=wompi is not implemented yet (M15).');
        }
        return new FakePaymentAdapter();
      },
    },
  ],
  exports: [PAYMENT_PORT],
})
export class PaymentModule {}

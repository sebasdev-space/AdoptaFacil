import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FakePaymentAdapter } from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { PAYMENT_PORT } from './payment.port';
import { WompiPaymentAdapter } from './wompi-payment.adapter';

/**
 * Shared PaymentPort provider (T-052). Global so any module injects PAYMENT_PORT
 * without re-binding it — mirrors STORAGE_PORT / NOTIFICATION_PORT (T-107).
 *
 * The adapter is chosen by PAYMENT_DRIVER ('fake' by default). The Fake adapter
 * is IMPORTED from @adoptafacil/contracts (dependency-free, deterministic) — NOT
 * copied here, so Fabián's `computeBreakdown` stays the single source of the
 * commission math. `wompi` binds the real gateway (recaudo, T-060/M15a) — the
 * dispersión T+1 side (M15b) is not implemented yet.
 */
@Global()
@Module({
  providers: [
    {
      provide: PAYMENT_PORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const driver = config.get('PAYMENT_DRIVER', { infer: true }) ?? 'fake';
        if (driver === 'wompi') {
          return new WompiPaymentAdapter(config);
        }
        return new FakePaymentAdapter();
      },
    },
  ],
  exports: [PAYMENT_PORT],
})
export class PaymentModule {}

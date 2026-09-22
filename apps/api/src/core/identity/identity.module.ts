import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FakeIdentityAdapter } from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { IDENTITY_PORT } from './identity.port';
import { GoogleIdentityAdapter } from './google-identity.adapter';

/**
 * Shared IdentityPort provider (T-Google-SignIn). Global so any module injects
 * IDENTITY_PORT without re-binding it — mirrors PaymentModule/StorageModule/
 * NotificationModule.
 *
 * The adapter is chosen by AUTH_IDENTITY_DRIVER ('fake' by default). The Fake
 * adapter is IMPORTED from @adoptafacil/contracts (dependency-free,
 * deterministic) — NOT copied here. `google` binds the real verifier
 * (google-auth-library) — blocked end-to-end on the client's real OAuth
 * Client ID (see env.validation.ts), same "stub until credentials exist"
 * shape PaymentModule had before T-052/MercadoPago.
 */
@Global()
@Module({
  providers: [
    {
      provide: IDENTITY_PORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const driver = config.get('AUTH_IDENTITY_DRIVER', { infer: true }) ?? 'fake';
        if (driver === 'google') {
          return new GoogleIdentityAdapter(config);
        }
        return new FakeIdentityAdapter();
      },
    },
  ],
  exports: [IDENTITY_PORT],
})
export class IdentityModule {}

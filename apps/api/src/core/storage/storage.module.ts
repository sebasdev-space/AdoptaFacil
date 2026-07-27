import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import type { Env } from '../../config/env.validation';
import { DiskStorageAdapter } from './disk-storage.adapter';
import { LocalStubStorageAdapter } from './local-stub-storage.adapter';
import { StorageController } from './storage.controller';
import { STORAGE_PORT } from './storage.port';

/**
 * Shared StoragePort provider (T-107) + real disk adapter (T-108). Global so any
 * module injects STORAGE_PORT without re-binding it. The adapter is chosen by
 * STORAGE_DRIVER: `disk` (real filesystem, prod) or `stub` (in-memory, tests).
 * Swapping to S3/GCS later = add an S3Adapter and one line in this factory — no
 * change to org/animals. The StorageController serves bytes with access control.
 */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [StorageController],
  providers: [
    {
      provide: STORAGE_PORT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        config.get('STORAGE_DRIVER', { infer: true }) === 'disk'
          ? new DiskStorageAdapter(config)
          : new LocalStubStorageAdapter(),
    },
  ],
  exports: [STORAGE_PORT],
})
export class StorageModule {}

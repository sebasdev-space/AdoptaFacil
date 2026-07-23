import { Global, Module } from '@nestjs/common';
import { LocalStubStorageAdapter } from './local-stub-storage.adapter';
import { STORAGE_PORT } from './storage.port';

/**
 * Shared StoragePort provider (T-107). Global so any module injects STORAGE_PORT
 * without re-binding it. Bound to the simulable stub in Ola 1; swap the class for
 * a real adapter here (one place) to go to production. Transversal infra —
 * consumed by org and animals today, by payments/community media later.
 */
@Global()
@Module({
  providers: [{ provide: STORAGE_PORT, useClass: LocalStubStorageAdapter }],
  exports: [STORAGE_PORT],
})
export class StorageModule {}

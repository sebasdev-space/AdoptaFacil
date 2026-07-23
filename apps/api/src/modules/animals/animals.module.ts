import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { AnimalsController } from './animals.controller';
import { AnimalsService } from './animals.service';
import { LocalStubStorageAdapter } from './storage/local-stub-storage.adapter';
import { ANIMAL_STORAGE_PORT } from './storage/storage.port';

/**
 * M03 · Animal record (expediente, RF07): attributes, status, custom breeds,
 * photos (metadata via StoragePort) and soft activation. Consumes core
 * (tenant/auth/rbac/audit) — global providers; AuthModule is imported for the
 * JwtAuthGuard. Storage is bound to the simulable stub adapter for Ola 1.
 * (Clinical record = RF08/T-105; reminders = RF09/T-106 — out of scope here.)
 */
@Module({
  imports: [AuthModule],
  controllers: [AnimalsController],
  providers: [AnimalsService, { provide: ANIMAL_STORAGE_PORT, useClass: LocalStubStorageAdapter }],
})
export class AnimalsModule {}

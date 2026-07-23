import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { AnimalsController } from './animals.controller';
import { AnimalsService } from './animals.service';
import { ClinicalController } from './clinical.controller';
import { ClinicalService } from './clinical.service';
import { LocalStubStorageAdapter } from './storage/local-stub-storage.adapter';
import { ANIMAL_STORAGE_PORT } from './storage/storage.port';

/**
 * M03 · Animal record (expediente, RF07) + clinical record (RF08, T-105):
 * attributes, status, custom breeds, photos, soft activation, and typed,
 * versioned clinical events with attachments. Consumes core
 * (tenant/auth/rbac/audit) — global providers; AuthModule is imported for the
 * JwtAuthGuard. Storage is bound to the simulable stub adapter for Ola 1 and
 * REUSED by the clinical service (no second copy). (Reminders = RF09/T-106.)
 */
@Module({
  imports: [AuthModule],
  controllers: [AnimalsController, ClinicalController],
  providers: [
    AnimalsService,
    ClinicalService,
    { provide: ANIMAL_STORAGE_PORT, useClass: LocalStubStorageAdapter },
  ],
})
export class AnimalsModule {}

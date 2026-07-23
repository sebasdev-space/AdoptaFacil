import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { AnimalsController } from './animals.controller';
import { AnimalsService } from './animals.service';
import { ClinicalController } from './clinical.controller';
import { ClinicalService } from './clinical.service';
import { RemindersController } from './reminders.controller';
import { RemindersProcessor } from './reminders.processor';
import { RemindersScheduler } from './reminders.scheduler';
import { RemindersService } from './reminders.service';
import { REMINDERS_QUEUE } from './reminders.constants';
import { LocalStubStorageAdapter } from './storage/local-stub-storage.adapter';
import { ANIMAL_STORAGE_PORT } from './storage/storage.port';

/**
 * M03 · Animal record (RF07) + clinical record (RF08) + clinical reminders
 * (RF09, T-106). Adds the background reminders worker: a repeatable BullMQ job
 * (on the reusable global QueueModule↔Redis connection) scans due clinical events
 * and generates in-app reminders, notifying best-effort via the global
 * NotificationPort with RNF07 backoff. The queue is registered here; the
 * processor stays inside this module. Storage/NotificationPort are REUSED (no
 * extra copies). Consumes core (tenant/auth/rbac/audit) — global providers.
 */
@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: REMINDERS_QUEUE })],
  controllers: [AnimalsController, ClinicalController, RemindersController],
  providers: [
    AnimalsService,
    ClinicalService,
    RemindersService,
    RemindersProcessor,
    RemindersScheduler,
    { provide: ANIMAL_STORAGE_PORT, useClass: LocalStubStorageAdapter },
  ],
})
export class AnimalsModule {}

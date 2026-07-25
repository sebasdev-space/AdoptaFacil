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
import { PublicAnimalsController } from './public-animals.controller';
import { PublicAnimalsService } from './public-animals.service';

/**
 * M03 · Animal record (RF07) + clinical record (RF08) + clinical reminders
 * (RF09, T-106) + public adoption catalog (RF07 public projection, T-029). Adds
 * the background reminders worker: a repeatable BullMQ job (on the reusable
 * global QueueModule↔Redis connection) scans due clinical events and generates
 * in-app reminders, notifying best-effort via the global NotificationPort with
 * RNF07 backoff. The public catalog exposes only adoptable animals via a bounded
 * SECURITY DEFINER function (no auth, no RLS evasion). STORAGE_PORT /
 * NOTIFICATION_PORT come from the shared global core modules (T-107). Consumes
 * core (tenant/auth/rbac/audit) — global providers.
 */
@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: REMINDERS_QUEUE })],
  controllers: [
    AnimalsController,
    ClinicalController,
    RemindersController,
    PublicAnimalsController,
  ],
  providers: [
    AnimalsService,
    ClinicalService,
    RemindersService,
    RemindersProcessor,
    RemindersScheduler,
    PublicAnimalsService,
  ],
})
export class AnimalsModule {}

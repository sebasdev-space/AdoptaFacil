import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import {
  REMINDER_SCAN_JOB,
  REMINDER_SEND_JOB,
  REMINDERS_QUEUE,
  type ReminderSendJobData,
} from './reminders.constants';
import { RemindersService } from './reminders.service';
import { REMINDER_MAX_ATTEMPTS, reminderBackoffMs } from './reminders.window';

/**
 * BullMQ worker for clinical reminders (RF09). Kept INSIDE the animals module
 * (only the BullMQ↔Redis connection is transversal). Two jobs:
 * - `scan`: cross-tenant generation (SECURITY DEFINER → withTenant), then one
 *   `send` job per newly created reminder.
 * - `send`: best-effort NotificationPort delivery; on failure the service throws
 *   so BullMQ retries with the RNF07 staggered backoff (5min/30min/2h/24h).
 */
@Processor(REMINDERS_QUEUE, {
  settings: { backoffStrategy: (attemptsMade: number) => reminderBackoffMs(attemptsMade) },
})
export class RemindersProcessor extends WorkerHost {
  private readonly logger = new Logger(RemindersProcessor.name);

  constructor(
    private readonly service: RemindersService,
    @InjectQueue(REMINDERS_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === REMINDER_SCAN_JOB) {
      const created = await this.service.generateDue();
      for (const item of created) {
        await this.queue.add(REMINDER_SEND_JOB, item, {
          attempts: REMINDER_MAX_ATTEMPTS,
          backoff: { type: 'custom' },
          removeOnComplete: true,
          removeOnFail: false,
        });
      }
      this.logger.log(`clinical-reminders scan: ${created.length} generated`);
      return;
    }

    if (job.name === REMINDER_SEND_JOB) {
      const data = job.data as ReminderSendJobData;
      await this.service.send(data.reminderId, data.organizationId);
    }
  }
}

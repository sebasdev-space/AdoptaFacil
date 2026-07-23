import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { Env } from '../../config/env.validation';
import { REMINDER_SCAN_JOB, REMINDERS_QUEUE } from './reminders.constants';

/**
 * Registers the repeatable clinical-reminders scan job (RF09). The interval is
 * env-configurable (REMINDERS_SCAN_INTERVAL_MS, default daily). BullMQ dedups the
 * repeatable entry by name + repeat options, so re-adding it on each boot is
 * safe. Skipped under NODE_ENV=test (integration tests drive the worker logic
 * directly); wrapped in try/catch so a missing Redis never blocks boot.
 */
@Injectable()
export class RemindersScheduler implements OnModuleInit {
  private readonly logger = new Logger(RemindersScheduler.name);

  constructor(
    @InjectQueue(REMINDERS_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') {
      return;
    }
    const every = this.config.get('REMINDERS_SCAN_INTERVAL_MS', { infer: true });
    try {
      await this.queue.add(
        REMINDER_SCAN_JOB,
        {},
        { repeat: { every }, removeOnComplete: true, removeOnFail: true },
      );
      this.logger.log(`clinical-reminders scan scheduled every ${every}ms`);
    } catch (error) {
      this.logger.warn(`Could not schedule clinical-reminders scan: ${(error as Error).message}`);
    }
  }
}

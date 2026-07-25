import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { Env } from '../../config/env.validation';
import {
  FOLLOWUP_SCAN_DEFAULT_INTERVAL_MS,
  FOLLOWUP_SCAN_JOB,
  FOLLOWUP_QUEUE,
} from './followup.constants';

/**
 * Registers the repeatable follow-up overdue scan (RF12) on the reusable global
 * BullMQ↔Redis connection. Interval is env-overridable via
 * ADOPTION_FOLLOWUP_SCAN_INTERVAL_MS (read from process.env so no core Env change);
 * defaults to daily. BullMQ dedups the repeatable entry, so re-adding on each boot
 * is safe. Skipped under NODE_ENV=test (integration tests drive the scan directly);
 * wrapped in try/catch so a missing Redis never blocks boot.
 */
@Injectable()
export class FollowUpScheduler implements OnModuleInit {
  private readonly logger = new Logger(FollowUpScheduler.name);

  constructor(
    @InjectQueue(FOLLOWUP_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') {
      return;
    }
    const raw = Number(process.env.ADOPTION_FOLLOWUP_SCAN_INTERVAL_MS);
    const every = Number.isFinite(raw) && raw > 0 ? raw : FOLLOWUP_SCAN_DEFAULT_INTERVAL_MS;
    try {
      await this.queue.add(
        FOLLOWUP_SCAN_JOB,
        {},
        { repeat: { every }, removeOnComplete: true, removeOnFail: true },
      );
      this.logger.log(`adoption follow-up overdue scan scheduled every ${every}ms`);
    } catch (error) {
      this.logger.warn(`Could not schedule follow-up scan: ${(error as Error).message}`);
    }
  }
}

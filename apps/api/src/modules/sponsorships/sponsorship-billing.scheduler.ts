import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { Env } from '../../config/env.validation';
import {
  SPONSORSHIP_BILLING_QUEUE,
  SPONSORSHIP_BILLING_SCAN_JOB,
  SPONSORSHIP_PAYMENT_POLL_JOB,
} from './sponsorship-billing.constants';

/**
 * Registers the TWO repeatable jobs of the sponsorship recurring-billing
 * worker (S-5-REDISEÑO, M07/RF17, T-057) — the FIRST real cron in this
 * project. Same shape as `RemindersScheduler` (T-106): env-configurable
 * intervals, BullMQ dedups the repeatable entry by name + repeat options (so
 * re-adding on every boot is safe), skipped under NODE_ENV=test (integration
 * tests drive the services directly), wrapped in try/catch so a missing
 * Redis never blocks boot.
 */
@Injectable()
export class SponsorshipBillingScheduler implements OnModuleInit {
  private readonly logger = new Logger(SponsorshipBillingScheduler.name);

  constructor(
    @InjectQueue(SPONSORSHIP_BILLING_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') {
      return;
    }

    const scanEvery = this.config.get('SPONSORSHIP_BILLING_SCAN_INTERVAL_MS', { infer: true });
    try {
      await this.queue.add(
        SPONSORSHIP_BILLING_SCAN_JOB,
        {},
        { repeat: { every: scanEvery }, removeOnComplete: true, removeOnFail: true },
      );
      this.logger.log(`sponsorship-billing scan scheduled every ${scanEvery}ms`);
    } catch (error) {
      this.logger.warn(`Could not schedule sponsorship-billing scan: ${(error as Error).message}`);
    }

    const pollEvery = this.config.get('SPONSORSHIP_PAYMENT_POLL_INTERVAL_MS', { infer: true });
    try {
      await this.queue.add(
        SPONSORSHIP_PAYMENT_POLL_JOB,
        {},
        { repeat: { every: pollEvery }, removeOnComplete: true, removeOnFail: true },
      );
      this.logger.log(`sponsorship-payment poll scheduled every ${pollEvery}ms`);
    } catch (error) {
      this.logger.warn(`Could not schedule sponsorship-payment poll: ${(error as Error).message}`);
    }
  }
}

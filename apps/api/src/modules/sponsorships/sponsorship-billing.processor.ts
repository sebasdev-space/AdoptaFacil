import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  SPONSORSHIP_BILLING_QUEUE,
  SPONSORSHIP_BILLING_SCAN_JOB,
  SPONSORSHIP_PAYMENT_POLL_JOB,
} from './sponsorship-billing.constants';
import { SponsorshipBillingService } from './sponsorship-billing.service';
import { SponsorshipPaymentPollerService } from './sponsorship-payment-poller.service';

/** Worker for both repeatable jobs on the `sponsorship-billing` queue
 *  (S-5-REDISEÑO, T-057) — same `@Processor`/`WorkerHost` shape as
 *  `RemindersProcessor` (T-106). */
@Processor(SPONSORSHIP_BILLING_QUEUE)
export class SponsorshipBillingProcessor extends WorkerHost {
  private readonly logger = new Logger(SponsorshipBillingProcessor.name);

  constructor(
    private readonly billing: SponsorshipBillingService,
    private readonly poller: SponsorshipPaymentPollerService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === SPONSORSHIP_BILLING_SCAN_JOB) {
      await this.billing.runDailyScan();
      this.logger.log('sponsorship-billing scan completed');
      return;
    }
    if (job.name === SPONSORSHIP_PAYMENT_POLL_JOB) {
      await this.poller.pollPending();
      this.logger.log('sponsorship-payment poll completed');
    }
  }
}

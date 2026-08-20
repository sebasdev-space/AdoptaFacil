import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  PAYOUT_DISPATCH_JOB,
  PAYOUTS_QUEUE,
  type PayoutDispatchJobData,
} from './payouts.constants';
import { payoutBackoffMs } from './payouts.window';
import { PayoutsService } from './payouts.service';

/**
 * BullMQ worker for Wompi payout dispatch (M15b, RF26). One job (`dispatch`):
 * calls the PaymentPort for a single scheduled payout; on failure the service
 * throws so BullMQ retries with the staggered backoff (5min/30min/2h/24h),
 * same pattern as the clinical-reminders worker.
 */
@Processor(PAYOUTS_QUEUE, {
  settings: { backoffStrategy: (attemptsMade: number) => payoutBackoffMs(attemptsMade) },
})
export class PayoutsProcessor extends WorkerHost {
  private readonly logger = new Logger(PayoutsProcessor.name);

  constructor(private readonly service: PayoutsService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === PAYOUT_DISPATCH_JOB) {
      const data = job.data as PayoutDispatchJobData;
      await this.service.dispatch(data.payoutId, data.organizationId);
      this.logger.log(`payout dispatched payoutId=${data.payoutId}`);
    }
  }
}

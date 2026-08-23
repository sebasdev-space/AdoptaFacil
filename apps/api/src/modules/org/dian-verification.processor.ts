import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  DIAN_VERIFICATION_QUEUE,
  type DianVerificationJobData,
} from './dian-verification.constants';
import { DianVerificationService } from './dian-verification.service';
import { dianVerificationBackoffMs } from './dian-verification.window';

/**
 * BullMQ worker for the DIAN verification queue (S-2, RNF07). Kept INSIDE the
 * org module (only the BullMQ↔Redis connection is transversal) — same
 * structure as `animals/reminders.processor.ts`. `job.attemptsMade` is
 * BullMQ's own count of prior failures, passed straight to the service so the
 * retry/status logic stays pure and testable outside BullMQ entirely.
 */
@Processor(DIAN_VERIFICATION_QUEUE, {
  settings: { backoffStrategy: (attemptsMade: number) => dianVerificationBackoffMs(attemptsMade) },
})
export class DianVerificationProcessor extends WorkerHost {
  private readonly logger = new Logger(DianVerificationProcessor.name);

  constructor(private readonly service: DianVerificationService) {
    super();
  }

  async process(job: Job<DianVerificationJobData>): Promise<void> {
    this.logger.log(
      `DIAN verification attempt ${job.attemptsMade + 1} for org ${job.data.organizationId} (${job.data.triggeredBy})`,
    );
    await this.service.attemptVerification(job.data, job.attemptsMade);
  }
}

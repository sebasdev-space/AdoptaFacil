import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { FOLLOWUP_SCAN_JOB, FOLLOWUP_QUEUE } from './followup.constants';
import { FollowUpService } from './followup.service';

/**
 * BullMQ worker for post-adoption follow-up (RF12). Kept INSIDE the adoptions
 * module (only the BullMQ↔Redis connection is transversal). One job:
 * - `scan`: cross-tenant, marks scheduled milestones past their due date as
 *   `overdue` and emits a best-effort NotificationPort alert for each (both
 *   audited). Runs the service logic that integration tests also drive directly.
 */
@Processor(FOLLOWUP_QUEUE)
export class FollowUpProcessor extends WorkerHost {
  private readonly logger = new Logger(FollowUpProcessor.name);

  constructor(private readonly service: FollowUpService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === FOLLOWUP_SCAN_JOB) {
      const overdue = await this.service.runOverdueScan();
      this.logger.log(`adoption follow-up scan: ${overdue.length} marked overdue`);
    }
  }
}

/** BullMQ queue + job names for the Wompi payout dispatcher (M15b, RF26). The
 *  queue runs on the reusable global BullMQ↔Redis connection (QueueModule). */
export const PAYOUTS_QUEUE = 'wompi-payouts';
export const PAYOUT_DISPATCH_JOB = 'dispatch';

/** Payload for a payout dispatch job. */
export interface PayoutDispatchJobData {
  payoutId: string;
  organizationId: string;
}

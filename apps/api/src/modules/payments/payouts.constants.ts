/** BullMQ queue + job names for the payout dispatcher (M15b, RF26, Fase 2 —
 *  not implemented yet). The queue runs on the reusable global BullMQ↔Redis
 *  connection (QueueModule). Queue NAME kept as-is (`wompi-payouts`) — it is
 *  an internal BullMQ identifier, not user/gateway-facing, and renaming it
 *  would orphan any already-scheduled jobs in Redis for zero benefit. */
export const PAYOUTS_QUEUE = 'wompi-payouts';
export const PAYOUT_DISPATCH_JOB = 'dispatch';

/** Payload for a payout dispatch job. */
export interface PayoutDispatchJobData {
  payoutId: string;
  organizationId: string;
}

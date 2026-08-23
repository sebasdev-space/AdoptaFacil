/** BullMQ queue + job name for the DIAN-verification worker (S-2, RNF07). The
 *  queue runs on the reusable global BullMQ↔Redis connection (QueueModule) —
 *  registered locally in org.module.ts, same pattern as REMINDERS_QUEUE. */
export const DIAN_VERIFICATION_QUEUE = 'dian-verification';
export const DIAN_VERIFICATION_JOB = 'verify';

export type DianVerificationTrigger = 'auto' | 'manual';

/** Payload for a verification job. `nit` travels only as in-flight job data —
 *  never persisted (see DianVerificationAttempt's comment). */
export interface DianVerificationJobData {
  organizationId: string;
  nit: string;
  triggeredBy: DianVerificationTrigger;
  actorUserId: string | null;
}

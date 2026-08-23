import type { DianVerificationCheckStatus } from '@adoptafacil/contracts';

/**
 * Pure helpers for the DIAN-verification worker (S-2, RNF07) — no DB, no I/O,
 * so the retry-backoff and status-derivation rules are unit tested in
 * isolation. Same schedule/shape as `animals/reminders.window.ts` (RF09) and
 * `payments/payouts.window.ts` (M15) — RNF07's staggered backoff is a single
 * project-wide convention, not reinvented per module.
 */

const BACKOFF_MS: readonly number[] = [
  5 * 60_000, // 5 min
  30 * 60_000, // 30 min
  2 * 60 * 60_000, // 2 h
  24 * 60 * 60_000, // 24 h
];

/** Total attempts = 1 initial + the staggered retries (RNF07). */
export const DIAN_VERIFICATION_MAX_ATTEMPTS = BACKOFF_MS.length + 1;

/** `attemptsMade` is BullMQ's count of attempts already failed (0 for the
 *  first call). Beyond the schedule it clamps to the last delay. */
export function dianVerificationBackoffMs(attemptsMade: number): number {
  if (attemptsMade <= 0) {
    return BACKOFF_MS[0];
  }
  return BACKOFF_MS[Math.min(attemptsMade - 1, BACKOFF_MS.length - 1)];
}

/** Whether the attempt about to run (`attemptsMade` already failed before it)
 *  is the LAST one the retry ladder allows. */
export function isFinalDianAttempt(attemptsMade: number): boolean {
  return attemptsMade >= DIAN_VERIFICATION_MAX_ATTEMPTS - 1;
}

export interface DianAttemptOutcome {
  status: DianVerificationCheckStatus;
  attemptNumber: number;
  nextRetryAt: Date | null;
}

/**
 * Derive the resulting status/attempt-number/next-retry from a single
 * attempt's outcome. `now` is injected (never `Date.now()` internally) so
 * this stays a pure, deterministic function under test.
 */
export function deriveDianAttemptOutcome(
  verified: boolean,
  attemptsMade: number,
  now: Date,
): DianAttemptOutcome {
  const attemptNumber = attemptsMade + 1;
  if (verified) {
    return { status: 'verified', attemptNumber, nextRetryAt: null };
  }
  const final = isFinalDianAttempt(attemptsMade);
  if (final) {
    return { status: 'failed', attemptNumber, nextRetryAt: null };
  }
  // `dianVerificationBackoffMs` expects the 1-based failure count BullMQ itself
  // uses when it calls the SAME function as `backoffStrategy` (verified against
  // `reminders.window.spec.ts`'s asserted mapping: backoffMs(1)=5min, not
  // backoffMs(0)) — that is exactly `attemptNumber` here, not `attemptsMade`.
  return {
    status: 'retrying',
    attemptNumber,
    nextRetryAt: new Date(now.getTime() + dianVerificationBackoffMs(attemptNumber)),
  };
}

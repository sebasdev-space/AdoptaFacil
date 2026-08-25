/**
 * Pure helpers for the recurring-billing ladder (S-5-REDISEÑO, M07/RF17,
 * T-057). No NestJS/DB here so the state machine and idempotency-key builder
 * are directly unit-testable.
 */

/** `YYYY-MM` in UTC (storage timezone — Colombia time is presentation only). */
export function billingPeriod(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Deterministic per-attempt idempotency key
 * (`sponsorship:<id>:<YYYY-MM>:attempt:<n>`) — a crashed/re-run job step that
 * repeats "create attempt N" must never generate a second link for the same
 * attempt.
 */
export function buildAttemptIdempotencyKey(
  sponsorshipId: string,
  period: string,
  attemptNumber: number,
): string {
  return `sponsorship:${sponsorshipId}:${period}:attempt:${attemptNumber}`;
}

/** Whole days elapsed between two dates (never negative). */
export function elapsedDays(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

/** UTC month arithmetic (no dependency) — used to advance a sponsorship's
 *  `nextBillingAt` by one period once it has been billed. */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

/** Tolerant ladder day-offsets — see `env.validation.ts` for the env-var
 *  defaults this mirrors (SPONSORSHIP_REMINDER_DAY_1, etc.). */
export interface LadderConfig {
  reminderDay1: number;
  expireAttempt1Day: number;
  reminderDay2: number;
  expireAttempt2Day: number;
  reminderFinalDay: number;
  expireAttempt3Day: number;
}

export interface LadderState {
  /** 1, 2, or 3 — a period is always created WITH attempt 1 (day 0), so this
   *  is never 0 for an open period. */
  attemptCount: number;
  /** 0-3. */
  remindersSent: number;
}

export type LadderActionType =
  | 'send_reminder_1'
  | 'expire_attempt_1_and_create_attempt_2'
  | 'send_reminder_2'
  | 'expire_attempt_2_and_create_attempt_3'
  | 'send_reminder_final'
  | 'expire_attempt_3_and_fail';

/**
 * Pure state machine: given the ladder's CURRENT persisted state and how many
 * days have elapsed since the period started, returns the single NEXT action
 * due, or `null` if nothing is due yet. The caller applies one action, then
 * calls this again — looping naturally "catches up" through several missed
 * thresholds in one job run (e.g. the server was down for 12 days), which is
 * what makes the job idempotent/resumable without any "is today exactly day
 * N" logic (RF17's non-negotiable "apoyarse en la idempotencia" restriction).
 * Each (attemptCount, remindersSent) pair maps to AT MOST one action, so
 * re-running with an unchanged state and the same elapsed days is a no-op.
 */
export function nextLadderAction(
  state: LadderState,
  elapsed: number,
  config: LadderConfig,
): LadderActionType | null {
  const { attemptCount, remindersSent } = state;

  if (attemptCount === 1 && remindersSent === 0 && elapsed >= config.reminderDay1) {
    return 'send_reminder_1';
  }
  if (attemptCount === 1 && remindersSent === 1 && elapsed >= config.expireAttempt1Day) {
    return 'expire_attempt_1_and_create_attempt_2';
  }
  if (attemptCount === 2 && remindersSent === 1 && elapsed >= config.reminderDay2) {
    return 'send_reminder_2';
  }
  if (attemptCount === 2 && remindersSent === 2 && elapsed >= config.expireAttempt2Day) {
    return 'expire_attempt_2_and_create_attempt_3';
  }
  if (attemptCount === 3 && remindersSent === 2 && elapsed >= config.reminderFinalDay) {
    return 'send_reminder_final';
  }
  if (attemptCount === 3 && remindersSent === 3 && elapsed >= config.expireAttempt3Day) {
    return 'expire_attempt_3_and_fail';
  }
  return null;
}

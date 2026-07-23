import { ReminderStatus, type ReminderResolution } from '@adoptafacil/contracts';

/**
 * Pure helpers for the clinical-reminders worker (RF09) — no DB, no I/O, so the
 * due-window, idempotency, retry-backoff and state-transition rules are unit
 * tested in isolation. The cross-tenant scan itself is a SECURITY DEFINER
 * function; these functions decide WHAT is due and HOW retries/resolutions work.
 */

export type DueClassification = 'overdue' | 'upcoming' | 'not_applicable';

/**
 * Classify a clinical event's next-due date against a look-ahead window (days):
 * - `overdue`        — due date is in the past
 * - `upcoming`       — due within `windowDays` from now
 * - `not_applicable` — no due date, or beyond the window
 * All arithmetic is UTC (storage is UTC; Colombia time is a UI concern only).
 */
export function classifyDue(
  nextDueDate: Date | null | undefined,
  now: Date,
  windowDays: number,
): DueClassification {
  if (!nextDueDate) {
    return 'not_applicable';
  }
  const due = nextDueDate.getTime();
  const nowMs = now.getTime();
  if (due < nowMs) {
    return 'overdue';
  }
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  if (due <= nowMs + windowMs) {
    return 'upcoming';
  }
  return 'not_applicable';
}

/** True when an event's next-due date warrants generating a reminder now. */
export function isDue(
  nextDueDate: Date | null | undefined,
  now: Date,
  windowDays: number,
): boolean {
  const c = classifyDue(nextDueDate, now, windowDays);
  return c === 'overdue' || c === 'upcoming';
}

/**
 * Stable idempotency key for a reminder: (logical clinical event id + due date +
 * type). A re-scan produces the same key, so the unique DB index makes it a
 * no-op. `dueDate` is normalized to its UTC millisecond instant.
 */
export function reminderIdempotencyKey(
  clinicalEventId: string,
  dueDate: Date,
  reminderType: string,
): string {
  return `${clinicalEventId}|${dueDate.getTime()}|${reminderType}`;
}

/**
 * Staggered retry backoff (RNF07): 5min → 30min → 2h → 24h. `attemptsMade` is
 * BullMQ's count of attempts already failed (1-based for the first retry). Beyond
 * the schedule it clamps to the last delay.
 */
const BACKOFF_MS: readonly number[] = [
  5 * 60_000, // 5 min
  30 * 60_000, // 30 min
  2 * 60 * 60_000, // 2 h
  24 * 60 * 60_000, // 24 h
];

/** Total attempts = 1 initial + the staggered retries (RNF07). */
export const REMINDER_MAX_ATTEMPTS = BACKOFF_MS.length + 1;

export function reminderBackoffMs(attemptsMade: number): number {
  if (attemptsMade <= 0) {
    return BACKOFF_MS[0];
  }
  return BACKOFF_MS[Math.min(attemptsMade - 1, BACKOFF_MS.length - 1)];
}

/** Map a user resolution verb to the resulting terminal status. */
export function statusForResolution(resolution: ReminderResolution): ReminderStatus {
  return resolution === 'acknowledge' ? ReminderStatus.Acknowledged : ReminderStatus.Dismissed;
}

/** Whether a reminder in `status` can still be resolved (acknowledged/dismissed).
 *  Already-resolved reminders are terminal. */
export function canResolve(status: ReminderStatus): boolean {
  return (
    status === ReminderStatus.Pending ||
    status === ReminderStatus.Sent ||
    status === ReminderStatus.Failed
  );
}

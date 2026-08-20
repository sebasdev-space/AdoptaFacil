/**
 * Pure helpers for the Wompi payout dispatcher (M15b, RF26) — no DB, no I/O,
 * so the retry-backoff schedule is unit tested in isolation, same pattern as
 * `animals/reminders.window.ts` (RNF07).
 */

/** Staggered retry backoff: 5min → 30min → 2h → 24h (same schedule already
 *  used for clinical reminders — reused here rather than inventing a new
 *  one). `attemptsMade` is BullMQ's count of attempts already failed
 *  (1-based for the first retry). Beyond the schedule it clamps to the last
 *  delay. */
const BACKOFF_MS: readonly number[] = [
  5 * 60_000, // 5 min
  30 * 60_000, // 30 min
  2 * 60 * 60_000, // 2 h
  24 * 60 * 60_000, // 24 h
];

/** Total attempts = 1 initial + the staggered retries. */
export const PAYOUT_MAX_ATTEMPTS = BACKOFF_MS.length + 1;

export function payoutBackoffMs(attemptsMade: number): number {
  if (attemptsMade <= 0) {
    return BACKOFF_MS[0];
  }
  return BACKOFF_MS[Math.min(attemptsMade - 1, BACKOFF_MS.length - 1)];
}

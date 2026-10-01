/**
 * Pure helper for the MercadoPago token-refresh scheduler (T-OAuth-Connect) —
 * no DB, no I/O, so the "is this account due for renewal" rule is unit tested
 * in isolation, same convention as `animals/reminders.window.ts` (RNF07) and
 * `payments/payouts.window.ts`.
 */

/** An account is due for refresh once its token expires within `windowDays`
 *  from `now` (MercadoPago tokens last ~180 days; the DEFAULT window is 15
 *  days — "not urgent, just don't let it lapse"). Already-expired tokens
 *  (`expiresAt` in the past) are also due — the scheduler still attempts the
 *  refresh_token grant rather than giving up on them. */
export function isDueForRefresh(expiresAt: Date, now: Date, windowDays: number): boolean {
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  return expiresAt.getTime() - now.getTime() <= windowMs;
}

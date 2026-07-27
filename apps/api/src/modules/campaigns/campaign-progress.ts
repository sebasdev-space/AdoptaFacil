/**
 * Derived campaign progress (RF15) — the SINGLE place the ratio is computed, so
 * the internal and public projections agree. Pure: integer COP in, ratio out.
 *
 * Returns raised/goal clamped to [0, 1], rounded to 4 decimals. Guards a
 * non-positive goal (returns 0) — the create schema forbids goal <= 0, this is
 * defense in depth. Never persisted.
 */
export function computeProgress(raisedAmount: number, goalAmount: number): number {
  if (goalAmount <= 0) {
    return 0;
  }
  const ratio = raisedAmount / goalAmount;
  const clamped = Math.min(Math.max(ratio, 0), 1);
  return Math.round(clamped * 10000) / 10000;
}

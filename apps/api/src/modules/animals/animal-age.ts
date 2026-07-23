import type { ComputedAge } from '@adoptafacil/contracts';

/**
 * Compute an animal's age (RF07) — DERIVED, never persisted. Prefers the exact
 * `birthDate`; falls back to an `approximateAgeMonths` (marked approximate).
 * Returns `undefined` when the age is unknown (no birth date, no approximate).
 * All arithmetic is in UTC so the result is deterministic regardless of server
 * timezone (storage is UTC; Colombia local time is a UI concern only).
 */
export function computeAge(
  birthDate: Date | null | undefined,
  approximateAgeMonths: number | null | undefined,
  now: Date,
): ComputedAge | undefined {
  if (birthDate) {
    let totalMonths =
      (now.getUTCFullYear() - birthDate.getUTCFullYear()) * 12 +
      (now.getUTCMonth() - birthDate.getUTCMonth());
    // Not yet reached the day-of-month → the current month hasn't completed.
    if (now.getUTCDate() < birthDate.getUTCDate()) {
      totalMonths -= 1;
    }
    if (totalMonths < 0) {
      totalMonths = 0; // guard against a future birth date
    }
    return {
      years: Math.floor(totalMonths / 12),
      months: totalMonths % 12,
      totalMonths,
      approximate: false,
    };
  }

  if (
    approximateAgeMonths !== null &&
    approximateAgeMonths !== undefined &&
    approximateAgeMonths >= 0
  ) {
    const totalMonths = Math.floor(approximateAgeMonths);
    return {
      years: Math.floor(totalMonths / 12),
      months: totalMonths % 12,
      totalMonths,
      approximate: true,
    };
  }

  return undefined;
}

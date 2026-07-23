import { computeAge } from './animal-age';

const NOW = new Date('2026-07-23T00:00:00.000Z');

describe('computeAge (RF07 — derived, never persisted)', () => {
  it('computes exact age from a birth date', () => {
    expect(computeAge(new Date('2024-07-23T00:00:00.000Z'), null, NOW)).toEqual({
      years: 2,
      months: 0,
      totalMonths: 24,
      approximate: false,
    });
  });

  it('computes years + months from a birth date', () => {
    expect(computeAge(new Date('2025-01-23T00:00:00.000Z'), null, NOW)).toEqual({
      years: 1,
      months: 6,
      totalMonths: 18,
      approximate: false,
    });
  });

  it('accounts for a not-yet-reached day of month', () => {
    // 2024-08-25 → 2026-07-23: the 25th of the current month hasn't arrived, so
    // the last month has not completed: 22 whole months (1y 10m).
    expect(computeAge(new Date('2024-08-25T00:00:00.000Z'), null, NOW)).toEqual({
      years: 1,
      months: 10,
      totalMonths: 22,
      approximate: false,
    });
  });

  it('falls back to an approximate age when the birth date is unknown', () => {
    expect(computeAge(null, 5, NOW)).toEqual({
      years: 0,
      months: 5,
      totalMonths: 5,
      approximate: true,
    });
  });

  it('prefers the birth date over the approximate age', () => {
    const age = computeAge(new Date('2025-07-23T00:00:00.000Z'), 99, NOW);
    expect(age).toMatchObject({ totalMonths: 12, approximate: false });
  });

  it('returns undefined when the age is unknown (no birth date, no approximate)', () => {
    expect(computeAge(null, null, NOW)).toBeUndefined();
    expect(computeAge(undefined, undefined, NOW)).toBeUndefined();
  });

  it('clamps a future birth date to 0 months', () => {
    expect(computeAge(new Date('2027-01-01T00:00:00.000Z'), null, NOW)).toEqual({
      years: 0,
      months: 0,
      totalMonths: 0,
      approximate: false,
    });
  });
});

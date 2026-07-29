import { describe, expect, it } from 'vitest';
import { ageLabel } from './animals-catalog';

describe('ageLabel (T-D02)', () => {
  it('formats years and months from the DERIVED computedAge', () => {
    expect(ageLabel({ years: 2, months: 3, totalMonths: 27, approximate: false })).toBe(
      '2 años 3 m',
    );
    expect(ageLabel({ years: 1, months: 0, totalMonths: 12, approximate: false })).toBe('1 año');
    expect(ageLabel({ years: 0, months: 6, totalMonths: 6, approximate: false })).toBe('6 m');
  });

  it('marks an approximate age with a leading ~', () => {
    expect(ageLabel({ years: 3, months: 0, totalMonths: 36, approximate: true })).toBe('~3 años');
  });

  it('is undefined (never fabricated) when the animal has no computed age', () => {
    expect(ageLabel(undefined)).toBeUndefined();
  });

  it('falls back to "< 1 mes" for a newborn (0 years, 0 months)', () => {
    expect(ageLabel({ years: 0, months: 0, totalMonths: 0, approximate: false })).toBe('< 1 mes');
  });
});

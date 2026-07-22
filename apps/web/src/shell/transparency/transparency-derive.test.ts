import { describe, expect, it } from 'vitest';
import { FORMALIZATION_SEQUENCE, FormalizationState } from '@adoptafacil/contracts';
import { deriveFormalizationPct, deriveTransparency } from './transparency-context';

/**
 * §M14 (T-027) — the transparency indicator's data is REAL and DERIVED, not
 * fabricated: `level` from the org's verification level, `formalizationPct` from
 * the position in FORMALIZATION_SEQUENCE, and `accountability` an honest
 * placeholder until M05/M06.
 */
describe('deriveFormalizationPct', () => {
  it('maps the first state to 0% and the last to 100%', () => {
    expect(deriveFormalizationPct(FormalizationState.Informal)).toBe(0);
    expect(deriveFormalizationPct(FormalizationState.ESAL_RTE)).toBe(100);
  });

  it('derives the % from the position in FORMALIZATION_SEQUENCE (index/total)', () => {
    const last = FORMALIZATION_SEQUENCE.length - 1;
    FORMALIZATION_SEQUENCE.forEach((state, index) => {
      expect(deriveFormalizationPct(state)).toBe(Math.round((index / last) * 100));
    });
    // Concretely: Formalizada is index 2 of 4 steps → 50%.
    expect(deriveFormalizationPct(FormalizationState.Formalizada)).toBe(50);
  });
});

describe('deriveTransparency', () => {
  it('uses the real verification level and derived formalization %', () => {
    const data = deriveTransparency({
      verificationLevel: { level: 3, criteria: [] },
      formalizationState: FormalizationState.ESAL,
    });
    expect(data.level).toBe(3);
    expect(data.formalizationPct).toBe(75); // index 3 of 4.
    // Rendición is never invented — it is an explicit placeholder.
    expect(data.accountability).toBe('no-disponible');
  });

  it('defaults to level 0 / 0% when the org has no verification/formalization data', () => {
    const data = deriveTransparency({});
    expect(data.level).toBe(0);
    expect(data.formalizationPct).toBe(0);
    expect(data.accountability).toBe('no-disponible');
  });
});

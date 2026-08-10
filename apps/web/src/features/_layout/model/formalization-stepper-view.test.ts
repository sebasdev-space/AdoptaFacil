import { describe, expect, it } from 'vitest';
import { formalizationSteps, formalizationStepIndex } from './formalization-stepper-view';

describe('formalizationStepIndex', () => {
  it('maps 0% to the first step (Informal)', () => {
    expect(formalizationStepIndex(0)).toBe(0);
  });

  it('maps 100% to the last step (ESAL + RTE)', () => {
    expect(formalizationStepIndex(100)).toBe(4);
  });

  it('maps 60% to the nearest step (Formalizada, index 2 of 0-4)', () => {
    // 60% * 4 = 2.4 → rounds to 2.
    expect(formalizationStepIndex(60)).toBe(2);
  });
});

describe('formalizationSteps', () => {
  it('returns the 5 real states in order, with es-CO labels', () => {
    const steps = formalizationSteps();
    expect(steps.map((s) => s.label)).toEqual([
      'Informal',
      'En proceso',
      'Formalizada',
      'ESAL',
      'ESAL + RTE',
    ]);
  });
});

import { FormalizationState } from '@adoptafacil/contracts';
import { checkTransition, rteVigenteFor } from './formalization.machine';

describe('formalization state machine', () => {
  it('allows a single forward step', () => {
    expect(
      checkTransition(FormalizationState.Informal, FormalizationState.EnProceso),
    ).toMatchObject({
      allowed: true,
      kind: 'forward',
      requiresReason: false,
    });
    expect(checkTransition(FormalizationState.ESAL, FormalizationState.ESAL_RTE)).toMatchObject({
      allowed: true,
      kind: 'forward',
    });
  });

  it('allows a single backward step but requires a reason', () => {
    const check = checkTransition(FormalizationState.Formalizada, FormalizationState.EnProceso);
    expect(check.allowed).toBe(true);
    expect(check.kind).toBe('backward');
    expect(check.requiresReason).toBe(true);
  });

  it('rejects skipping states (forward or backward)', () => {
    expect(
      checkTransition(FormalizationState.Informal, FormalizationState.Formalizada).allowed,
    ).toBe(false);
    expect(checkTransition(FormalizationState.Informal, FormalizationState.ESAL_RTE).allowed).toBe(
      false,
    );
    expect(checkTransition(FormalizationState.ESAL_RTE, FormalizationState.Informal).allowed).toBe(
      false,
    );
  });

  it('rejects a no-op transition to the same state', () => {
    const check = checkTransition(FormalizationState.EnProceso, FormalizationState.EnProceso);
    expect(check.allowed).toBe(false);
    expect(check.error).toMatch(/already in/i);
  });

  it('keeps rteVigente coherent: only ESAL_RTE implies it', () => {
    expect(rteVigenteFor(FormalizationState.ESAL_RTE)).toBe(true);
    expect(rteVigenteFor(FormalizationState.ESAL)).toBe(false);
    expect(rteVigenteFor(FormalizationState.Formalizada)).toBe(false);
    expect(rteVigenteFor(FormalizationState.Informal)).toBe(false);
  });
});

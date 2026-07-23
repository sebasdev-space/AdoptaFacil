import { DocumentType, FormalizationState } from '@adoptafacil/contracts';
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

  describe('parametrizable document gate (T-103)', () => {
    // A TEST requirements map (production is empty — TODO(client)). Gates the
    // forward step INTO EnProceso on an approved & current RUT.
    const requirements = { [FormalizationState.EnProceso]: [DocumentType.Rut] };

    it('blocks a forward step when a required document is missing/expired', () => {
      const check = checkTransition(FormalizationState.Informal, FormalizationState.EnProceso, {
        requirements,
        satisfiedDocuments: [],
      });
      expect(check.allowed).toBe(false);
      expect(check.error).toMatch(/approved and current|vigente/i);
    });

    it('allows the forward step once the required document is satisfied', () => {
      const check = checkTransition(FormalizationState.Informal, FormalizationState.EnProceso, {
        requirements,
        satisfiedDocuments: [DocumentType.Rut],
      });
      expect(check).toMatchObject({ allowed: true, kind: 'forward' });
    });

    it('does not gate backward steps', () => {
      const check = checkTransition(FormalizationState.EnProceso, FormalizationState.Informal, {
        requirements,
        satisfiedDocuments: [],
      });
      expect(check.allowed).toBe(true);
      expect(check.kind).toBe('backward');
    });

    it('applies NO gate by default (empty catalog → T-102 behavior preserved)', () => {
      expect(
        checkTransition(FormalizationState.Informal, FormalizationState.EnProceso).allowed,
      ).toBe(true);
    });
  });
});

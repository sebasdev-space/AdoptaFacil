import { canTransitionContract, checkContractTransition } from './adoption-contract-status';

describe('adoption contract state machine', () => {
  it('allows draft → pending_signatures → signed and cancel from the non-terminal states', () => {
    expect(canTransitionContract('draft', 'pending_signatures')).toBe(true);
    expect(canTransitionContract('pending_signatures', 'signed')).toBe(true);
    expect(canTransitionContract('draft', 'cancelled')).toBe(true);
    expect(canTransitionContract('pending_signatures', 'cancelled')).toBe(true);
  });

  it('rejects skips, backward moves and any move out of the terminal states', () => {
    expect(canTransitionContract('draft', 'signed')).toBe(false); // skip
    expect(canTransitionContract('pending_signatures', 'draft')).toBe(false); // backward
    expect(canTransitionContract('signed', 'cancelled')).toBe(false); // signed is terminal
    expect(canTransitionContract('signed', 'pending_signatures')).toBe(false); // signed is terminal
    expect(canTransitionContract('cancelled', 'draft')).toBe(false); // cancelled is terminal
  });

  it('checkContractTransition guards the sealed state, no-ops and invalid moves', () => {
    expect(checkContractTransition('signed', 'cancelled')).toEqual({
      allowed: false,
      error: expect.stringContaining('inmutable'),
    });
    expect(checkContractTransition('draft', 'draft')).toEqual({
      allowed: false,
      error: expect.stringContaining('ya está'),
    });
    expect(checkContractTransition('draft', 'signed').allowed).toBe(false);
    expect(checkContractTransition('draft', 'pending_signatures')).toEqual({ allowed: true });
  });
});

import { canTransitionAdoption, checkAdoptionTransition } from './adoption-status';

describe('adoption state machine', () => {
  it('allows only the forward flow new → in_review → approved | rejected', () => {
    expect(canTransitionAdoption('new', 'in_review')).toBe(true);
    expect(canTransitionAdoption('in_review', 'approved')).toBe(true);
    expect(canTransitionAdoption('in_review', 'rejected')).toBe(true);
  });

  it('rejects skips, backward moves and moves out of terminal states', () => {
    expect(canTransitionAdoption('new', 'approved')).toBe(false); // skip
    expect(canTransitionAdoption('in_review', 'new')).toBe(false); // backward
    expect(canTransitionAdoption('approved', 'rejected')).toBe(false); // terminal
    expect(canTransitionAdoption('rejected', 'in_review')).toBe(false); // terminal
  });

  it('checkAdoptionTransition explains no-op and invalid transitions', () => {
    expect(checkAdoptionTransition('new', 'new')).toEqual({
      allowed: false,
      error: expect.stringContaining('ya está'),
    });
    expect(checkAdoptionTransition('new', 'approved').allowed).toBe(false);
    expect(checkAdoptionTransition('new', 'in_review')).toEqual({ allowed: true });
  });
});

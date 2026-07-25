import {
  canSubmitFollowUp,
  canTransitionFollowUp,
  checkFollowUpTransition,
} from './followup-status';

describe('adoption follow-up milestone state machine', () => {
  it('allows scheduled → completed|overdue and a late overdue → completed', () => {
    expect(canTransitionFollowUp('scheduled', 'completed')).toBe(true);
    expect(canTransitionFollowUp('scheduled', 'overdue')).toBe(true);
    expect(canTransitionFollowUp('overdue', 'completed')).toBe(true);
  });

  it('rejects moves out of completed and any invalid move', () => {
    expect(canTransitionFollowUp('completed', 'overdue')).toBe(false); // terminal
    expect(canTransitionFollowUp('completed', 'scheduled')).toBe(false); // terminal
    expect(canTransitionFollowUp('overdue', 'scheduled')).toBe(false); // backward
  });

  it('checkFollowUpTransition guards terminal, no-op and invalid moves', () => {
    expect(checkFollowUpTransition('completed', 'overdue')).toEqual({
      allowed: false,
      error: expect.stringContaining('completado'),
    });
    expect(checkFollowUpTransition('scheduled', 'scheduled')).toEqual({
      allowed: false,
      error: expect.stringContaining('ya está'),
    });
    expect(checkFollowUpTransition('scheduled', 'completed')).toEqual({ allowed: true });
  });

  it('lets the adopter respond only while scheduled or overdue', () => {
    expect(canSubmitFollowUp('scheduled')).toBe(true);
    expect(canSubmitFollowUp('overdue')).toBe(true);
    expect(canSubmitFollowUp('completed')).toBe(false);
  });
});

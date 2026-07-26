import { DONATION_TRANSITIONS, type DonationStatus } from '@adoptafacil/contracts';
import { canTransitionDonation, checkDonationTransition } from './donation-status';

/**
 * §M05 — donation state machine (pending → approved | declined). The backend helper
 * MUST mirror the published `DONATION_TRANSITIONS` graph exactly so the frontend and
 * the API never disagree on which moves are legal.
 */
describe('donation-status', () => {
  it('mirrors the published DONATION_TRANSITIONS graph exactly', () => {
    const statuses: DonationStatus[] = ['pending', 'approved', 'declined'];
    for (const from of statuses) {
      for (const to of statuses) {
        const expected = DONATION_TRANSITIONS[from].includes(to);
        expect(canTransitionDonation(from, to)).toBe(expected);
      }
    }
  });

  it('allows pending → approved and pending → declined', () => {
    expect(checkDonationTransition('pending', 'approved').allowed).toBe(true);
    expect(checkDonationTransition('pending', 'declined').allowed).toBe(true);
  });

  it('rejects moving out of a terminal state (approved/declined)', () => {
    expect(checkDonationTransition('approved', 'declined').allowed).toBe(false);
    expect(checkDonationTransition('declined', 'approved').allowed).toBe(false);
    expect(checkDonationTransition('approved', 'approved').allowed).toBe(false);
  });

  it('rejects a no-op transition with a clear reason', () => {
    const check = checkDonationTransition('pending', 'pending');
    expect(check.allowed).toBe(false);
    expect(check.error).toMatch(/pending/);
  });
});

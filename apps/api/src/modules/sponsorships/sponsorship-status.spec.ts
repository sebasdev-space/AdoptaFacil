import { SponsorshipStatus } from '@adoptafacil/contracts';
import { canTransitionSponsorship, checkSponsorshipTransition } from './sponsorship-status';

describe('canTransitionSponsorship (T-056)', () => {
  it('allows active → suspended', () => {
    expect(canTransitionSponsorship(SponsorshipStatus.Active, SponsorshipStatus.Suspended)).toBe(
      true,
    );
  });

  it('allows suspended → active (reactivate)', () => {
    expect(canTransitionSponsorship(SponsorshipStatus.Suspended, SponsorshipStatus.Active)).toBe(
      true,
    );
  });

  it('allows active → cancelled and suspended → cancelled', () => {
    expect(canTransitionSponsorship(SponsorshipStatus.Active, SponsorshipStatus.Cancelled)).toBe(
      true,
    );
    expect(canTransitionSponsorship(SponsorshipStatus.Suspended, SponsorshipStatus.Cancelled)).toBe(
      true,
    );
  });

  it('rejects any transition OUT of cancelled (terminal)', () => {
    expect(canTransitionSponsorship(SponsorshipStatus.Cancelled, SponsorshipStatus.Active)).toBe(
      false,
    );
    expect(canTransitionSponsorship(SponsorshipStatus.Cancelled, SponsorshipStatus.Suspended)).toBe(
      false,
    );
  });

  it('rejects a same-state transition', () => {
    expect(canTransitionSponsorship(SponsorshipStatus.Active, SponsorshipStatus.Active)).toBe(
      false,
    );
  });
});

describe('checkSponsorshipTransition (T-056)', () => {
  it('explains a same-state rejection', () => {
    const result = checkSponsorshipTransition(SponsorshipStatus.Active, SponsorshipStatus.Active);
    expect(result.allowed).toBe(false);
    expect(result.error).toMatch(/ya está en estado/);
  });

  it('explains an invalid transition (cancelled → active)', () => {
    const result = checkSponsorshipTransition(
      SponsorshipStatus.Cancelled,
      SponsorshipStatus.Active,
    );
    expect(result.allowed).toBe(false);
    expect(result.error).toMatch(/Transición no permitida/);
  });

  it('allows a valid transition with no error', () => {
    const result = checkSponsorshipTransition(
      SponsorshipStatus.Active,
      SponsorshipStatus.Suspended,
    );
    expect(result).toEqual({ allowed: true });
  });
});

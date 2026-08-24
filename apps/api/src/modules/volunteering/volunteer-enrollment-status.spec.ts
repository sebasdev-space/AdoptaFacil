import { VolunteerEnrollmentStatus } from '@adoptafacil/contracts';
import { canTransitionEnrollment, checkEnrollmentTransition } from './volunteer-enrollment-status';

describe('volunteer-enrollment-status (RF18)', () => {
  it('allows pending → accepted and pending → rejected', () => {
    expect(
      canTransitionEnrollment(
        VolunteerEnrollmentStatus.Pending,
        VolunteerEnrollmentStatus.Accepted,
      ),
    ).toBe(true);
    expect(
      canTransitionEnrollment(
        VolunteerEnrollmentStatus.Pending,
        VolunteerEnrollmentStatus.Rejected,
      ),
    ).toBe(true);
  });

  it('allows accepted → completed', () => {
    expect(
      canTransitionEnrollment(
        VolunteerEnrollmentStatus.Accepted,
        VolunteerEnrollmentStatus.Completed,
      ),
    ).toBe(true);
  });

  it('rejects any transition out of a terminal state (rejected/completed)', () => {
    expect(
      canTransitionEnrollment(
        VolunteerEnrollmentStatus.Rejected,
        VolunteerEnrollmentStatus.Accepted,
      ),
    ).toBe(false);
    expect(
      canTransitionEnrollment(
        VolunteerEnrollmentStatus.Completed,
        VolunteerEnrollmentStatus.Accepted,
      ),
    ).toBe(false);
  });

  it('rejects skipping straight from pending to completed', () => {
    expect(
      canTransitionEnrollment(
        VolunteerEnrollmentStatus.Pending,
        VolunteerEnrollmentStatus.Completed,
      ),
    ).toBe(false);
  });

  it('checkEnrollmentTransition explains a same-state no-op', () => {
    const result = checkEnrollmentTransition(
      VolunteerEnrollmentStatus.Pending,
      VolunteerEnrollmentStatus.Pending,
    );
    expect(result.allowed).toBe(false);
    expect(result.error).toMatch(/ya está en estado/);
  });

  it('checkEnrollmentTransition explains an invalid transition', () => {
    const result = checkEnrollmentTransition(
      VolunteerEnrollmentStatus.Rejected,
      VolunteerEnrollmentStatus.Accepted,
    );
    expect(result.allowed).toBe(false);
    expect(result.error).toMatch(/no permitida/);
  });

  it('checkEnrollmentTransition allows a valid transition with no error', () => {
    const result = checkEnrollmentTransition(
      VolunteerEnrollmentStatus.Pending,
      VolunteerEnrollmentStatus.Accepted,
    );
    expect(result).toEqual({ allowed: true });
  });
});

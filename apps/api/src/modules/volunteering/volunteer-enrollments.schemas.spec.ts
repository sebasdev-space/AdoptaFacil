import { decideVolunteerEnrollmentSchema } from './volunteer-enrollments.schemas';

describe('decideVolunteerEnrollmentSchema (RF18)', () => {
  it('accepts an accept decision with no reason', () => {
    expect(decideVolunteerEnrollmentSchema.safeParse({ decision: 'accept' }).success).toBe(true);
  });

  it('rejects a reject decision with no reason', () => {
    expect(decideVolunteerEnrollmentSchema.safeParse({ decision: 'reject' }).success).toBe(false);
  });

  it('accepts a reject decision WITH a reason', () => {
    expect(
      decideVolunteerEnrollmentSchema.safeParse({ decision: 'reject', reason: 'Cupo lleno' })
        .success,
    ).toBe(true);
  });

  it('rejects an empty-string reason on reject', () => {
    expect(
      decideVolunteerEnrollmentSchema.safeParse({ decision: 'reject', reason: '' }).success,
    ).toBe(false);
  });

  it('rejects an invalid decision value', () => {
    expect(decideVolunteerEnrollmentSchema.safeParse({ decision: 'maybe' }).success).toBe(false);
  });
});

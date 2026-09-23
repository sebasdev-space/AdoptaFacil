import {
  createVolunteerEnrollmentSchema,
  decideVolunteerEnrollmentSchema,
} from './volunteer-enrollments.schemas';

const OPPORTUNITY_ID = '11111111-1111-1111-1111-111111111111';

describe('createVolunteerEnrollmentSchema (S-12, FSD v3.5 Doc 8)', () => {
  it('accepts a plain enrollment with no guardian/school fields', () => {
    expect(
      createVolunteerEnrollmentSchema.safeParse({ opportunityId: OPPORTUNITY_ID }).success,
    ).toBe(true);
  });

  it('accepts isMinor=true WITHOUT guardian fields — enrollment-time capture is optional', () => {
    expect(
      createVolunteerEnrollmentSchema.safeParse({ opportunityId: OPPORTUNITY_ID, isMinor: true })
        .success,
    ).toBe(true);
  });

  it('accepts the full student-service shape', () => {
    expect(
      createVolunteerEnrollmentSchema.safeParse({
        opportunityId: OPPORTUNITY_ID,
        isMinor: true,
        guardianName: 'Andrés Gámez',
        guardianDocument: '123456',
        schoolName: 'Colegio Mayor de Colombia',
        schoolAgreementCode: 'CONV-EDU-2026-04',
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown key', () => {
    expect(
      createVolunteerEnrollmentSchema.safeParse({
        opportunityId: OPPORTUNITY_ID,
        extra: 'nope',
      }).success,
    ).toBe(false);
  });
});

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

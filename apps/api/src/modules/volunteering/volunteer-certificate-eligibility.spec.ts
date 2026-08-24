import {
  checkCertificateEligibility,
  studentServiceMinHours,
  sumApprovedHours,
} from './volunteer-certificate-eligibility';

describe('sumApprovedHours (RF18/RF19)', () => {
  it('sums only APPROVED entries — never pending or rejected', () => {
    const entries = [
      { status: 'approved', hours: 3 },
      { status: 'pending', hours: 5 },
      { status: 'rejected', hours: 10 },
      { status: 'approved', hours: 2.5 },
    ];
    expect(sumApprovedHours(entries)).toBe(5.5);
  });

  it('returns 0 for an empty list', () => {
    expect(sumApprovedHours([])).toBe(0);
  });

  it('returns 0 when nothing is approved', () => {
    expect(sumApprovedHours([{ status: 'pending', hours: 8 }])).toBe(0);
  });
});

describe('studentServiceMinHours (RF19, Resolución 4210/1996 art. 6°)', () => {
  const ORIGINAL_ENV = process.env.STUDENT_SERVICE_MIN_HOURS;
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.STUDENT_SERVICE_MIN_HOURS;
    else process.env.STUDENT_SERVICE_MIN_HOURS = ORIGINAL_ENV;
  });

  it('defaults to 80 hours when unset', () => {
    delete process.env.STUDENT_SERVICE_MIN_HOURS;
    expect(studentServiceMinHours()).toBe(80);
  });

  it('is configurable via env var', () => {
    process.env.STUDENT_SERVICE_MIN_HOURS = '100';
    expect(studentServiceMinHours()).toBe(100);
  });

  it('falls back to the default on an invalid override', () => {
    process.env.STUDENT_SERVICE_MIN_HOURS = '-5';
    expect(studentServiceMinHours()).toBe(80);
    process.env.STUDENT_SERVICE_MIN_HOURS = 'not-a-number';
    expect(studentServiceMinHours()).toBe(80);
  });
});

describe('checkCertificateEligibility (RF19: "no se certifican horas parciales")', () => {
  it('general volunteering (appliesToStudentService=false) is ALWAYS eligible, even with 0 hours', () => {
    expect(checkCertificateEligibility(false, 0, 80)).toEqual({ eligible: true });
    expect(checkCertificateEligibility(false, 5, 80)).toEqual({ eligible: true });
  });

  it('student service below the minimum is NOT eligible, with the exact missing hours', () => {
    expect(checkCertificateEligibility(true, 60, 80)).toEqual({
      eligible: false,
      missingHours: 20,
    });
  });

  it('student service exactly at the minimum is eligible', () => {
    expect(checkCertificateEligibility(true, 80, 80)).toEqual({ eligible: true });
  });

  it('student service above the minimum is eligible', () => {
    expect(checkCertificateEligibility(true, 95.5, 80)).toEqual({ eligible: true });
  });

  it('rounds missingHours to 2 decimals for fractional hours', () => {
    expect(checkCertificateEligibility(true, 79.333, 80)).toEqual({
      eligible: false,
      missingHours: 0.67,
    });
  });
});

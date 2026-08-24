import { decideServiceHoursSchema, logServiceHoursSchema } from './service-hours.schemas';

const BASE_LOG = {
  enrollmentId: '11111111-1111-1111-1111-111111111111',
  date: '2026-07-01T00:00:00.000Z',
  hours: 2.5,
  description: 'Apoyo en la jornada de vacunación',
};

describe('logServiceHoursSchema (RF18/RF19)', () => {
  it('accepts fractional, positive hours', () => {
    expect(logServiceHoursSchema.safeParse(BASE_LOG).success).toBe(true);
  });

  it('rejects zero or negative hours', () => {
    expect(logServiceHoursSchema.safeParse({ ...BASE_LOG, hours: 0 }).success).toBe(false);
    expect(logServiceHoursSchema.safeParse({ ...BASE_LOG, hours: -2 }).success).toBe(false);
  });

  it('rejects an unreasonably large single-session amount (> 24h)', () => {
    expect(logServiceHoursSchema.safeParse({ ...BASE_LOG, hours: 30 }).success).toBe(false);
  });

  it('rejects an empty description', () => {
    expect(logServiceHoursSchema.safeParse({ ...BASE_LOG, description: '' }).success).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    expect(logServiceHoursSchema.safeParse({ ...BASE_LOG, sneaky: 1 }).success).toBe(false);
  });
});

describe('decideServiceHoursSchema (RF18/RF19)', () => {
  it('accepts an approve decision with no reason', () => {
    expect(decideServiceHoursSchema.safeParse({ decision: 'approve' }).success).toBe(true);
  });

  it('rejects a reject decision with no reason', () => {
    expect(decideServiceHoursSchema.safeParse({ decision: 'reject' }).success).toBe(false);
  });

  it('accepts a reject decision WITH a reason', () => {
    expect(
      decideServiceHoursSchema.safeParse({ decision: 'reject', reason: 'Fecha inconsistente' })
        .success,
    ).toBe(true);
  });
});

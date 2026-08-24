import { createVolunteerOpportunitySchema } from './volunteer-opportunities.schemas';

const BASE = {
  title: 'Jornada de esterilización',
  category: 'sterilizations',
  startDate: '2026-09-01T00:00:00.000Z',
  endDate: '2026-09-02T00:00:00.000Z',
  location: 'Refugio Patitas',
};

describe('createVolunteerOpportunitySchema (RF18)', () => {
  it('accepts a valid opportunity with all optional fields', () => {
    expect(
      createVolunteerOpportunitySchema.safeParse({
        ...BASE,
        description: 'Ayuda con la jornada',
        capacity: 10,
        requirements: 'Mayor de edad',
        appliesToStudentService: true,
      }).success,
    ).toBe(true);
  });

  it('accepts the minimal required fields', () => {
    expect(createVolunteerOpportunitySchema.safeParse(BASE).success).toBe(true);
  });

  it('rejects endDate before or equal to startDate', () => {
    expect(
      createVolunteerOpportunitySchema.safeParse({
        ...BASE,
        startDate: '2026-09-02T00:00:00.000Z',
        endDate: '2026-09-01T00:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      createVolunteerOpportunitySchema.safeParse({ ...BASE, endDate: BASE.startDate }).success,
    ).toBe(false);
  });

  it('rejects a non-positive capacity', () => {
    expect(createVolunteerOpportunitySchema.safeParse({ ...BASE, capacity: 0 }).success).toBe(
      false,
    );
    expect(createVolunteerOpportunitySchema.safeParse({ ...BASE, capacity: -3 }).success).toBe(
      false,
    );
  });

  it('rejects unknown keys (strict)', () => {
    expect(createVolunteerOpportunitySchema.safeParse({ ...BASE, sneaky: 1 }).success).toBe(false);
  });
});

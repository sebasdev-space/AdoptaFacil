import { SponsorshipPeriodicity } from '@adoptafacil/contracts';
import { createSponsorshipPlanSchema } from './sponsorships.schemas';

const BASE = {
  animalId: '11111111-1111-1111-1111-111111111111',
  name: 'Padrinazgo mensual de Firu',
  amount: 30_000,
  periodicity: SponsorshipPeriodicity.Monthly,
};

describe('createSponsorshipPlanSchema (T-056)', () => {
  it('accepts a valid plan (integer COP, monthly)', () => {
    expect(createSponsorshipPlanSchema.safeParse(BASE).success).toBe(true);
  });

  it('rejects a non-integer amount (money is never float)', () => {
    expect(createSponsorshipPlanSchema.safeParse({ ...BASE, amount: 30_000.5 }).success).toBe(
      false,
    );
  });

  it('rejects a zero or negative amount', () => {
    expect(createSponsorshipPlanSchema.safeParse({ ...BASE, amount: 0 }).success).toBe(false);
    expect(createSponsorshipPlanSchema.safeParse({ ...BASE, amount: -1 }).success).toBe(false);
  });

  it('rejects a periodicity outside the closed enum', () => {
    expect(createSponsorshipPlanSchema.safeParse({ ...BASE, periodicity: 'weekly' }).success).toBe(
      false,
    );
  });

  it('rejects unknown keys (strict)', () => {
    expect(createSponsorshipPlanSchema.safeParse({ ...BASE, sneaky: 1 }).success).toBe(false);
  });
});

import { createCampaignSchema, updateCampaignSchema } from './campaigns.schemas';

const valid = {
  title: 'Vacunas de invierno',
  category: 'medications',
  goalAmount: 500_000,
  deadline: '2026-12-31T00:00:00.000Z',
};

describe('campaign validation (RF15)', () => {
  it('accepts a valid campaign', () => {
    expect(createCampaignSchema.safeParse(valid).success).toBe(true);
  });

  it('requires title, category, goalAmount and deadline', () => {
    expect(createCampaignSchema.safeParse({ ...valid, title: '' }).success).toBe(false);
    const { category: _c, ...noCategory } = valid;
    expect(createCampaignSchema.safeParse(noCategory).success).toBe(false);
    const { goalAmount: _g, ...noGoal } = valid;
    expect(createCampaignSchema.safeParse(noGoal).success).toBe(false);
    const { deadline: _d, ...noDeadline } = valid;
    expect(createCampaignSchema.safeParse(noDeadline).success).toBe(false);
  });

  it('rejects a non-integer or non-positive goal (integer COP > 0)', () => {
    expect(createCampaignSchema.safeParse({ ...valid, goalAmount: 0 }).success).toBe(false);
    expect(createCampaignSchema.safeParse({ ...valid, goalAmount: -5 }).success).toBe(false);
    expect(createCampaignSchema.safeParse({ ...valid, goalAmount: 10.5 }).success).toBe(false);
  });

  it('rejects a category outside the closed enum', () => {
    expect(createCampaignSchema.safeParse({ ...valid, category: 'marketing' }).success).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    expect(createCampaignSchema.safeParse({ ...valid, raisedAmount: 999 }).success).toBe(false);
  });

  it('update requires at least one field and validates status', () => {
    expect(updateCampaignSchema.safeParse({}).success).toBe(false);
    expect(updateCampaignSchema.safeParse({ status: 'cancelled' }).success).toBe(true);
    expect(updateCampaignSchema.safeParse({ status: 'weird' }).success).toBe(false);
  });
});

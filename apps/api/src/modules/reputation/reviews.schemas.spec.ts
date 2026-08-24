import { createReviewSchema, decideReviewSchema, hideReviewSchema } from './reviews.schemas';

describe('createReviewSchema', () => {
  const base = { organizationId: '11111111-1111-1111-1111-111111111111', rating: 5 };

  it('accepts a minimal valid review', () => {
    expect(createReviewSchema.safeParse(base).success).toBe(true);
  });

  it('accepts a full review with comment and isAnonymous', () => {
    const result = createReviewSchema.safeParse({
      ...base,
      comment: 'Excelente organización',
      isAnonymous: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a rating below 1', () => {
    expect(createReviewSchema.safeParse({ ...base, rating: 0 }).success).toBe(false);
  });

  it('rejects a rating above 5', () => {
    expect(createReviewSchema.safeParse({ ...base, rating: 6 }).success).toBe(false);
  });

  it('rejects a non-integer rating', () => {
    expect(createReviewSchema.safeParse({ ...base, rating: 3.5 }).success).toBe(false);
  });

  it('rejects an unknown field (.strict())', () => {
    expect(createReviewSchema.safeParse({ ...base, extra: 'x' }).success).toBe(false);
  });
});

describe('decideReviewSchema', () => {
  it('accepts approve without a reason', () => {
    expect(decideReviewSchema.safeParse({ decision: 'approve' }).success).toBe(true);
  });

  it('rejects reject without a reason', () => {
    expect(decideReviewSchema.safeParse({ decision: 'reject' }).success).toBe(false);
  });

  it('accepts reject with a reason', () => {
    expect(
      decideReviewSchema.safeParse({ decision: 'reject', reason: 'Contenido ofensivo' }).success,
    ).toBe(true);
  });
});

describe('hideReviewSchema', () => {
  it('requires a non-empty reason', () => {
    expect(hideReviewSchema.safeParse({ reason: '' }).success).toBe(false);
    expect(hideReviewSchema.safeParse({ reason: 'Reportada por la organización' }).success).toBe(
      true,
    );
  });
});

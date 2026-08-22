import { moderatePostSchema } from './community-moderation.schemas';

describe('community moderation validation (M11)', () => {
  it('requires a reason to remove', () => {
    expect(moderatePostSchema.safeParse({ decision: 'remove' }).success).toBe(false);
    expect(
      moderatePostSchema.safeParse({ decision: 'remove', reason: 'Contenido ofensivo' }).success,
    ).toBe(true);
  });

  it('does not require a reason to restore', () => {
    expect(moderatePostSchema.safeParse({ decision: 'restore' }).success).toBe(true);
  });

  it('rejects an unknown decision', () => {
    expect(moderatePostSchema.safeParse({ decision: 'delete' }).success).toBe(false);
  });
});

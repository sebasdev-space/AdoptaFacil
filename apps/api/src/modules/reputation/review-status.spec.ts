import { ReviewStatus } from '@adoptafacil/contracts';
import { canTransitionReview } from './review-status';

describe('canTransitionReview (RF23)', () => {
  it('allows pending -> approved', () => {
    expect(canTransitionReview(ReviewStatus.Pending, ReviewStatus.Approved)).toBe(true);
  });

  it('allows pending -> rejected', () => {
    expect(canTransitionReview(ReviewStatus.Pending, ReviewStatus.Rejected)).toBe(true);
  });

  it('allows approved -> hidden', () => {
    expect(canTransitionReview(ReviewStatus.Approved, ReviewStatus.Hidden)).toBe(true);
  });

  it('rejects rejected -> approved (terminal state cannot be revived)', () => {
    expect(canTransitionReview(ReviewStatus.Rejected, ReviewStatus.Approved)).toBe(false);
  });

  it('rejects hidden -> approved (terminal, no way back)', () => {
    expect(canTransitionReview(ReviewStatus.Hidden, ReviewStatus.Approved)).toBe(false);
  });

  it('rejects approved -> rejected (approval is not reversible into a rejection)', () => {
    expect(canTransitionReview(ReviewStatus.Approved, ReviewStatus.Rejected)).toBe(false);
  });

  it('rejects pending -> hidden (must be approved first)', () => {
    expect(canTransitionReview(ReviewStatus.Pending, ReviewStatus.Hidden)).toBe(false);
  });
});

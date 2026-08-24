import { ReviewStatus } from '@adoptafacil/contracts';

/**
 * Pure mirror of the DB trigger `reviews_validate_transition()` (migration
 * `20260824090000_s7_reputation_module`) — the DB trigger is the actual
 * enforced invariant; this lets the allowed graph be unit-tested without a
 * database. Keep both in sync if the graph ever changes.
 */
export const REVIEW_TRANSITIONS: Record<ReviewStatus, readonly ReviewStatus[]> = {
  [ReviewStatus.Pending]: [ReviewStatus.Approved, ReviewStatus.Rejected],
  [ReviewStatus.Approved]: [ReviewStatus.Hidden],
  [ReviewStatus.Rejected]: [],
  [ReviewStatus.Hidden]: [],
};

export function canTransitionReview(from: ReviewStatus, to: ReviewStatus): boolean {
  return REVIEW_TRANSITIONS[from].includes(to);
}

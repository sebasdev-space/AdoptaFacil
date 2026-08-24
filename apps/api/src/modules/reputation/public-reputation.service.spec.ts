import { toSummary } from './public-reputation.service';

describe('toSummary (RF23 — averageRating/approvedReviewsCount calculation)', () => {
  it('defaults to 0/0 when there are no approved reviews (AVG() is NULL)', () => {
    expect(toSummary('org-1', { average_rating: null, approved_review_count: 0 })).toEqual({
      organizationId: 'org-1',
      averageRating: 0,
      approvedReviewsCount: 0,
    });
  });

  it('parses the NUMERIC string Postgres returns into a real number', () => {
    expect(toSummary('org-1', { average_rating: '4.33', approved_review_count: 3 })).toEqual({
      organizationId: 'org-1',
      averageRating: 4.33,
      approvedReviewsCount: 3,
    });
  });

  it('handles an undefined row (defensive) the same as zero reviews', () => {
    expect(toSummary('org-1', undefined)).toEqual({
      organizationId: 'org-1',
      averageRating: 0,
      approvedReviewsCount: 0,
    });
  });
});

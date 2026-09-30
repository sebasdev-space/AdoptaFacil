import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { PublicReputationService, toSummary } from './public-reputation.service';

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

function makeService(): { service: PublicReputationService; queryRaw: jest.Mock } {
  const queryRaw = jest.fn();
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  return { service: new PublicReputationService(prisma), queryRaw };
}

describe('PublicReputationService.createPublicReview (S7-b — portal público, sin sesión)', () => {
  it('creates an anonymous review, already approved, with no authorUserId', async () => {
    const h = makeService();
    h.queryRaw
      .mockResolvedValueOnce([{ data: { id: 'org-1' } }]) // resolveOrgId
      .mockResolvedValueOnce([
        {
          id: 'rev-public-1',
          organization_id: 'org-1',
          author_user_id: null,
          rating: 5,
          comment: 'Excelente refugio',
          is_anonymous: true,
          status: 'approved',
          created_at: new Date('2026-09-29T00:00:00.000Z'),
        },
      ]);

    const result = await h.service.createPublicReview('org-slug', {
      rating: 5,
      comment: 'Excelente refugio',
    });

    expect(result).toMatchObject({
      id: 'rev-public-1',
      organizationId: 'org-1',
      authorUserId: undefined,
      status: 'approved',
      isAnonymous: true,
    });
  });

  it('throws NotFound when the slug does not resolve to an organization', async () => {
    const h = makeService();
    h.queryRaw.mockResolvedValueOnce([{ data: null }]);

    await expect(
      h.service.createPublicReview('missing-slug', { rating: 4 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

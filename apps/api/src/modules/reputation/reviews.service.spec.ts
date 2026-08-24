import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { AuditService } from '../../core/audit/audit.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../../core/auth/auth.types';
import { ReviewsService } from './reviews.service';

interface Harness {
  service: ReviewsService;
  queryRaw: jest.Mock;
  record: jest.Mock;
}

function makeService(): Harness {
  const queryRaw = jest.fn();
  const record = jest.fn().mockResolvedValue({});
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  const audit = { record } as unknown as AuditService;
  return { service: new ReviewsService(prisma, audit), queryRaw, record };
}

const actor: RequestUser = {
  id: 'user-1',
  email: 'donante@test.local',
  organizationId: 'org-self',
  roles: [],
} as unknown as RequestUser;

describe('ReviewsService.create (RF23)', () => {
  it('creates a review and audits it', async () => {
    const h = makeService();
    h.queryRaw.mockResolvedValueOnce([
      {
        id: 'rev-1',
        organization_id: 'org-1',
        author_user_id: 'user-1',
        rating: 5,
        comment: 'Excelente',
        is_anonymous: false,
        status: 'pending',
        moderated_by_user_id: null,
        moderated_at: null,
        rejection_reason: null,
        created_at: new Date('2026-08-24T00:00:00.000Z'),
      },
    ]);

    const result = await h.service.create(actor, {
      organizationId: 'org-1',
      rating: 5,
      comment: 'Excelente',
    });

    expect(result).toMatchObject({ id: 'rev-1', organizationId: 'org-1', status: 'pending' });
    expect(h.record).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        actorUserId: 'user-1',
        action: 'reputation.review_created',
      }),
    );
  });

  it('rejects a second review by the same author on the same organization (one review per org per user)', async () => {
    const h = makeService();
    // Prisma's wrapped message for a raw-query unique_violation only surfaces
    // the Postgres DETAIL, not "duplicate key value violates unique
    // constraint" — see the matching comment in ReviewsService.create.
    h.queryRaw.mockRejectedValueOnce(
      new Error(
        'Raw query failed. Code: `23505`. Message: `Key (organization_id, author_user_id)=(org-1, user-1) already exists.`',
      ),
    );

    await expect(
      h.service.create(actor, { organizationId: 'org-1', rating: 4 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.record).not.toHaveBeenCalled();
  });

  it('throws NotFound when the organization does not exist (create_review returns no rows)', async () => {
    const h = makeService();
    h.queryRaw.mockResolvedValueOnce([]);

    await expect(
      h.service.create(actor, { organizationId: 'org-missing', rating: 3 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

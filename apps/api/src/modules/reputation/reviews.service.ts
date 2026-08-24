import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type CreateReviewInput,
  type Review,
  type ReviewMine,
  ReviewStatus,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestUser } from '../../core/auth/auth.types';

/** Raw row from `create_review(...)` — snake_case, real Date objects. */
interface ReviewRawRow {
  id: string;
  organization_id: string;
  author_user_id: string;
  rating: number;
  comment: string | null;
  is_anonymous: boolean;
  status: string;
  moderated_by_user_id: string | null;
  moderated_at: Date | null;
  rejection_reason: string | null;
  created_at: Date;
}

/** One JSONB element from `reviews_for_author(...)` — already camelCase. */
interface ReviewMineRow {
  id: string;
  organizationId: string;
  organizationName: string;
  authorUserId: string;
  rating: number;
  comment: string | null;
  isAnonymous: boolean;
  status: string;
  moderatedByUserId: string | null;
  moderatedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

function fromRawRow(row: ReviewRawRow): Review {
  return {
    id: row.id,
    organizationId: row.organization_id,
    authorUserId: row.author_user_id,
    rating: row.rating,
    comment: row.comment ?? undefined,
    isAnonymous: row.is_anonymous,
    status: row.status as ReviewStatus,
    moderatedByUserId: row.moderated_by_user_id ?? undefined,
    moderatedAt: row.moderated_at?.toISOString(),
    rejectionReason: row.rejection_reason ?? undefined,
    createdAt: row.created_at.toISOString(),
  };
}

function fromMineRow(row: ReviewMineRow): ReviewMine {
  return {
    id: row.id,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    authorUserId: row.authorUserId,
    rating: row.rating,
    comment: row.comment ?? undefined,
    isAnonymous: row.isAnonymous,
    status: row.status as ReviewStatus,
    moderatedByUserId: row.moderatedByUserId ?? undefined,
    moderatedAt: row.moderatedAt ?? undefined,
    rejectionReason: row.rejectionReason ?? undefined,
    createdAt: row.createdAt,
  };
}

/**
 * Reviews (RF23 · M12). Creating is open to ANY authenticated Person,
 * cross-tenant by design (the author is never necessarily a member of the
 * reviewed org) — same technique as M08's `create_volunteer_enrollment`. A
 * review is never editable and there is no per-org tenant-scoped read here:
 * moderation lives entirely in `PlatformReviewsService` (cross-tenant, gated
 * to platform roles), and public reads live in `PublicReputationService`.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(actor: RequestUser, input: CreateReviewInput): Promise<Review> {
    let rows: ReviewRawRow[];
    try {
      rows = await this.prisma.$queryRaw<ReviewRawRow[]>(
        Prisma.sql`SELECT * FROM create_review(
          ${input.organizationId}::uuid,
          ${actor.id}::uuid,
          ${input.rating}::int,
          ${input.comment ?? null},
          ${input.isAnonymous ?? false}
        )`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Prisma's wrapped message for a raw-query unique_violation only
      // surfaces the Postgres DETAIL ("Key (...) already exists."), not the
      // "duplicate key value violates unique constraint" primary message —
      // match on the SQLSTATE code (23505) instead of the word "unique".
      if (/23505|already exists/i.test(message)) {
        throw new BadRequestException('Ya reseñaste esta organización.');
      }
      throw error;
    }
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('Organization not found');
    }

    await this.audit.record({
      organizationId: row.organization_id,
      actorUserId: actor.id,
      action: 'reputation.review_created',
      entityType: 'review',
      entityId: row.id,
      metadata: { rating: row.rating, isAnonymous: row.is_anonymous },
    });

    return fromRawRow(row);
  }

  /** The caller's own reviews across all organizations ("Mis reseñas"). */
  async listMine(actor: RequestUser): Promise<ReviewMine[]> {
    const rows = await this.prisma.$queryRaw<Array<{ data: ReviewMineRow[] }>>(
      Prisma.sql`SELECT reviews_for_author(${actor.id}::uuid) AS data`,
    );
    const items = rows[0]?.data ?? [];
    return items.map(fromMineRow);
  }
}

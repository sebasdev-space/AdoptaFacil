import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type DecideReviewInput,
  type HideReviewInput,
  type Review,
  type ReviewModerationQueueItem,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Map the review decision verb to the stored status it produces. */
const DECISION_STATUS: Record<DecideReviewInput['decision'], string> = {
  approve: 'approved',
  reject: 'rejected',
};

/**
 * Cross-tenant platform review moderation (M12, RF23). Reviewers (PlatformAdmin
 * /PlatformSuperAdmin) act ACROSS organizations, so this service never reads
 * or writes another org's rows through the tenant RLS path — it calls bounded
 * SECURITY DEFINER functions (`platform_review_queue`, `platform_review_decide`,
 * `platform_review_hide`) that run as their owner and expose only the
 * necessary columns. Access is gated to platform roles at the controller —
 * these functions are the only cross-tenant path and are never reachable by
 * an org role, including the reviewed organization itself.
 */
@Injectable()
export class PlatformReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pending/approved reviews across all organizations — the actionable queue. */
  async queue(): Promise<ReviewModerationQueueItem[]> {
    const rows = await this.prisma.$queryRaw<Array<{ data: ReviewModerationQueueItem[] | null }>>(
      Prisma.sql`SELECT platform_review_queue() AS data`,
    );
    return rows[0]?.data ?? [];
  }

  /** Approve/reject a pending review. The update + audit event are atomic in
   *  the DEFINER function, under the REVIEWED org. A reason is mandatory to
   *  reject (validated by the schema and re-enforced in the function). */
  async decide(
    reviewerUserId: string,
    reviewId: string,
    input: DecideReviewInput,
  ): Promise<Review> {
    if (!UUID_RE.test(reviewId)) {
      throw new BadRequestException('Invalid review id');
    }
    const status = DECISION_STATUS[input.decision];
    const reason = input.reason?.trim() ? input.reason.trim() : null;

    try {
      const rows = await this.prisma.$queryRaw<Array<{ data: Review }>>(
        Prisma.sql`SELECT platform_review_decide(${reviewId}::uuid, ${status}, ${reviewerUserId}::uuid, ${reason}) AS data`,
      );
      return rows[0].data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/review not found/i.test(message)) {
        throw new NotFoundException('Review not found');
      }
      if (/already decided/i.test(message)) {
        throw new BadRequestException('This review has already been decided.');
      }
      if (/reason is required/i.test(message)) {
        throw new BadRequestException('A reason is required to reject a review.');
      }
      throw error;
    }
  }

  /** Hide an already-approved review after a later report (objective #3). */
  async hide(reviewerUserId: string, reviewId: string, input: HideReviewInput): Promise<Review> {
    if (!UUID_RE.test(reviewId)) {
      throw new BadRequestException('Invalid review id');
    }
    const reason = input.reason.trim();

    try {
      const rows = await this.prisma.$queryRaw<Array<{ data: Review }>>(
        Prisma.sql`SELECT platform_review_hide(${reviewId}::uuid, ${reviewerUserId}::uuid, ${reason}) AS data`,
      );
      return rows[0].data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/review not found/i.test(message)) {
        throw new NotFoundException('Review not found');
      }
      if (/only an approved review/i.test(message)) {
        throw new BadRequestException('Only an approved review can be hidden.');
      }
      throw error;
    }
  }
}

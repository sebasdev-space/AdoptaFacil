import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { type CreateReviewInput, type Review, type ReviewMine, Role } from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { ReviewsService } from './reviews.service';
import { createReviewSchema } from './reviews.schemas';

/**
 * M12 reviews (RF23) — creating and reading one's own reviews is open to ANY
 * authenticated Person (no `@Roles` gate); moderation of THESE (verified,
 * `author_user_id` set) lives entirely in `PlatformReviewsController`
 * (deny-by-default to platform roles).
 *
 * `mark-spam` (S7-b) is the one exception, and only for the OTHER kind of
 * review: the anonymous/public one created via
 * `POST /public/organizations/:slug/reviews` — there the Owner/Administrator
 * of the reviewed org IS the moderator, by explicit client decision.
 * `owner_mark_review_spam` enforces both the tenant match and that the review
 * is the public kind, so this never reaches a verified review.
 */
@Controller('reviews')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReviewsController {
  constructor(private readonly service: ReviewsService) {}

  @Post()
  create(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(createReviewSchema)) dto: CreateReviewInput,
  ): Promise<Review> {
    return this.service.create(actor, dto);
  }

  @Get('mine')
  listMine(@CurrentUser() actor: RequestUser): Promise<ReviewMine[]> {
    return this.service.listMine(actor);
  }

  /** Lo que el Owner/Administrator necesita para poder usar `mark-spam`
   *  abajo: sus propias reseñas PÚBLICAS (nunca las autenticadas — esas
   *  siguen exclusivas de PlatformAdmin). */
  @Get('org')
  @Roles(Role.Owner, Role.Administrator)
  listForOrg(): Promise<Review[]> {
    return this.service.listForOrg();
  }

  @Post(':id/mark-spam')
  @HttpCode(200)
  @Roles(Role.Owner, Role.Administrator)
  markSpam(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Review> {
    return this.service.markSpam(actor, id);
  }
}

import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { type CreateReviewInput, type Review, type ReviewMine } from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { ReviewsService } from './reviews.service';
import { createReviewSchema } from './reviews.schemas';

/**
 * M12 reviews (RF23) — creating and reading one's own reviews is open to ANY
 * authenticated Person (no `@Roles` gate); moderation lives entirely in
 * `PlatformReviewsController` (deny-by-default to platform roles).
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
}

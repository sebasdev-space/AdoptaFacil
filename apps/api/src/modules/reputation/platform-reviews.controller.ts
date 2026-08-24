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
import {
  type DecideReviewInput,
  type HideReviewInput,
  type Review,
  type ReviewModerationQueueItem,
  Role,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { PlatformReviewsService } from './platform-reviews.service';
import { decideReviewSchema, hideReviewSchema } from './reviews.schemas';

/**
 * M12 review moderation (RF23), audience = PLATFORM ONLY. Deny-by-default:
 * only PlatformAdmin/PlatformSuperAdmin — never an org role, and never the
 * reviewed organization itself (conflict of interest, same criterion as S-3
 * duplicity and the documents queue, S1-05/S2-06).
 */
@Controller('platform/reviews')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PlatformAdmin, Role.PlatformSuperAdmin)
export class PlatformReviewsController {
  constructor(private readonly service: PlatformReviewsService) {}

  @Get('queue')
  queue(): Promise<ReviewModerationQueueItem[]> {
    return this.service.queue();
  }

  @Post(':id/decision')
  @HttpCode(200)
  decide(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(decideReviewSchema)) dto: DecideReviewInput,
  ): Promise<Review> {
    return this.service.decide(actor.id, id, dto);
  }

  @Post(':id/hide')
  @HttpCode(200)
  hide(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(hideReviewSchema)) dto: HideReviewInput,
  ): Promise<Review> {
    return this.service.hide(actor.id, id, dto);
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role, type ModeratePostInput, type Post, type PostsPage } from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { CommunityModerationService } from './community-moderation.service';
import { moderatePostSchema } from './community-moderation.schemas';

/**
 * CROSS-TENANT moderación básica de la comunidad (M11). Gated a roles de
 * PLATAFORMA (deny-by-default): las lecturas/escrituras cruzadas pasan por
 * funciones SECURITY DEFINER acotadas — mismo patrón que
 * `PlatformDocumentsController` (M01, RF03).
 */
@Controller('platform/community/posts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PlatformAdmin, Role.PlatformSuperAdmin)
export class CommunityModerationController {
  constructor(private readonly service: CommunityModerationService) {}

  @Get()
  queue(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<PostsPage> {
    return this.service.queue(Number(limit), Number(offset), status);
  }

  @Patch(':id/moderate')
  moderate(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(moderatePostSchema)) dto: ModeratePostInput,
  ): Promise<Post> {
    return this.service.moderate(actor.id, id, dto);
  }
}

import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { CommunityPostsController } from './community-posts.controller';
import { CommunityPostsService } from './community-posts.service';
import { CommunityCommentsService } from './community-comments.service';
import { CommunityLikesService } from './community-likes.service';
import { CommunityModerationController } from './community-moderation.controller';
import { CommunityModerationService } from './community-moderation.service';

/**
 * M11 · Comunidad (Ola 3, F-8): publicaciones, comentarios, likes y
 * moderación básica de plataforma. El feed es CRUZADO por diseño (ver
 * `community.prisma`); comentarios/likes/publicaciones de Persona pasan por
 * funciones SECURITY DEFINER acotadas, nunca un select crudo que evada RLS.
 * Consumes core (tenant/auth/rbac/audit/storage/notifications) — global
 * providers; AuthModule solo para el JwtAuthGuard.
 */
@Module({
  imports: [AuthModule],
  controllers: [CommunityPostsController, CommunityModerationController],
  providers: [
    CommunityPostsService,
    CommunityCommentsService,
    CommunityLikesService,
    CommunityModerationService,
  ],
})
export class CommunityModule {}

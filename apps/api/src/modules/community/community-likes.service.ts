import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ToggleLikeResult } from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * M11 (comunidad) — likes. SIEMPRE cross-tenant por identidad; togglear pasa
 * por una función SECURITY DEFINER que inserta/elimina la fila y mantiene el
 * contador desnormalizado de la publicación en la misma transacción SQL.
 */
@Injectable()
export class CommunityLikesService {
  constructor(private readonly prisma: PrismaService) {}

  async toggle(userId: string, postId: string): Promise<ToggleLikeResult> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ data: ToggleLikeResult }>>(
        Prisma.sql`SELECT toggle_community_post_like(${postId}::uuid, ${userId}::uuid) AS data`,
      );
      return rows[0].data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/post not found/i.test(message)) {
        throw new NotFoundException('Post not found');
      }
      if (/cannot like a removed post/i.test(message)) {
        throw new ForbiddenException(
          'This post was removed by moderation and can no longer be liked',
        );
      }
      throw error;
    }
  }
}

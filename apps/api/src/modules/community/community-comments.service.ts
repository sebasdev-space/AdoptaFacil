import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Comment, CommentsPage, CreateCommentInput } from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { clampLimit } from './community-posts.service';

/** Row emitted by the SECURITY DEFINER functions (camelCase — I control the
 *  jsonb_build_object keys). */
interface RawComment {
  id: string;
  postId: string;
  authorUserId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

function fromRaw(raw: RawComment): Comment {
  return {
    id: raw.id,
    postId: raw.postId,
    authorUserId: raw.authorUserId,
    authorName: raw.authorName,
    body: raw.body,
    createdAt: raw.createdAt,
  };
}

/**
 * M11 (comunidad) — comentarios. SIEMPRE cross-tenant por identidad (quien
 * comenta casi nunca pertenece a la organización de la publicación), así que
 * cada escritura pasa por una función SECURITY DEFINER acotada — nunca un
 * `withOrgContext` con el tenant del comentarista.
 */
@Injectable()
export class CommunityCommentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The actor's display name, resolved under their OWN tenant. */
  private async resolveAuthorName(actor: RequestUser): Promise<string> {
    const user = await this.prisma.withOrgContext(actor.organizationId, (tx) =>
      tx.user.findUnique({ where: { id: actor.id } }),
    );
    return user?.displayName ?? actor.email;
  }

  async create(actor: RequestUser, postId: string, input: CreateCommentInput): Promise<Comment> {
    const authorName = await this.resolveAuthorName(actor);
    try {
      const rows = await this.prisma.$queryRaw<Array<{ data: RawComment }>>(
        Prisma.sql`SELECT create_community_comment(${postId}::uuid, ${actor.id}::uuid, ${authorName}, ${input.body}) AS data`,
      );
      return fromRaw(rows[0].data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/post not found/i.test(message)) {
        throw new NotFoundException('Post not found');
      }
      if (/cannot comment on a removed post/i.test(message)) {
        throw new ForbiddenException(
          'This post was removed by moderation and can no longer be commented on',
        );
      }
      throw error;
    }
  }

  async list(postId: string, limit: number, offset: number): Promise<CommentsPage> {
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    const rows = await this.prisma.$queryRaw<
      Array<{ data: { items: RawComment[]; total: number } }>
    >(
      Prisma.sql`SELECT community_comments_for_post(${postId}::uuid, ${take}::int, ${skip}::int) AS data`,
    );
    const data = rows[0]?.data ?? { items: [], total: 0 };
    return {
      items: (data.items ?? []).map(fromRaw),
      total: data.total ?? 0,
      limit: take,
      offset: skip,
    };
  }

  async removeOwn(actor: RequestUser, commentId: string): Promise<void> {
    try {
      await this.prisma.$queryRaw(
        Prisma.sql`SELECT community_comment_delete_own(${commentId}::uuid, ${actor.id}::uuid)`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/comment not found/i.test(message)) {
        throw new NotFoundException('Comment not found');
      }
      if (/not the author/i.test(message)) {
        throw new ForbiddenException('You are not the author of this comment');
      }
      throw error;
    }
  }
}

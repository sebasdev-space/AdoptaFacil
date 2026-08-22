import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ModeratePostInput, Post, PostType, PostsPage } from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import { clampLimit } from './community-posts.service';

interface RawPost {
  id: string;
  organizationId: string | null;
  organizationName?: string | null;
  authorUserId: string;
  authorName: string;
  type: string;
  title: string | null;
  body: string;
  status: string;
  commentCount: number;
  likeCount: number;
  moderationReason?: string | null;
  images: Array<{ id: string; storageRef: string; order: number }>;
  createdAt: string;
  updatedAt: string;
}

/**
 * M11 (comunidad) — moderación básica de plataforma. Cross-tenant por
 * naturaleza (el equipo de plataforma no pertenece a la organización de la
 * publicación), así que TODO pasa por funciones SECURITY DEFINER acotadas
 * (`community_posts_moderation_queue`/`community_post_moderate`) — mismo
 * patrón que `PlatformDocumentsService`. Acceso restringido a
 * PlatformAdmin/PlatformSuperAdmin, aplicado en el controller.
 */
@Injectable()
export class CommunityModerationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  private fromRaw(raw: RawPost): Post {
    return {
      id: raw.id,
      organizationId: raw.organizationId ?? undefined,
      organizationName: raw.organizationName ?? undefined,
      authorUserId: raw.authorUserId,
      authorName: raw.authorName,
      type: raw.type as PostType,
      title: raw.title ?? undefined,
      body: raw.body,
      images: [...(raw.images ?? [])]
        .sort((a, b) => a.order - b.order)
        .map((i) => ({
          id: i.id,
          storageRef: i.storageRef,
          order: i.order,
          url: this.storage.resolvePublicUrl(i.storageRef),
        })),
      commentCount: raw.commentCount,
      likeCount: raw.likeCount,
      status: raw.status as Post['status'],
      moderationReason: raw.moderationReason ?? undefined,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  /** Cola de moderación: todas las publicaciones (cualquier organización, o
   *  de plataforma), filtro opcional por estado. */
  async queue(limit: number, offset: number, status?: string): Promise<PostsPage> {
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    const rows = await this.prisma.$queryRaw<Array<{ data: { items: RawPost[]; total: number } }>>(
      Prisma.sql`SELECT community_posts_moderation_queue(${take}::int, ${skip}::int, ${status ?? null}::text) AS data`,
    );
    const data = rows[0]?.data ?? { items: [], total: 0 };
    return {
      items: (data.items ?? []).map((r) => this.fromRaw(r)),
      total: data.total ?? 0,
      limit: take,
      offset: skip,
    };
  }

  /** Aplicar una decisión (remove/restore); auditado dentro de la función. */
  async moderate(reviewerUserId: string, postId: string, input: ModeratePostInput): Promise<Post> {
    const reason = input.reason?.trim() ? input.reason.trim() : null;
    try {
      const rows = await this.prisma.$queryRaw<Array<{ data: RawPost }>>(
        Prisma.sql`SELECT community_post_moderate(${postId}::uuid, ${input.decision}, ${reviewerUserId}::uuid, ${reason}) AS data`,
      );
      return this.fromRaw(rows[0].data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/post not found/i.test(message)) {
        throw new NotFoundException('Post not found');
      }
      if (/reason is required/i.test(message)) {
        throw new BadRequestException('A reason is required to remove a post.');
      }
      throw error;
    }
  }
}

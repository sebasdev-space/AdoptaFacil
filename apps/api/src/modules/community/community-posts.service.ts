import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Post as PostRow, PostImage as PostImageRow } from '@prisma/client';
import {
  type CreatePostInput,
  type CreatePostResult,
  type Post,
  type PostImage,
  PostType,
  type PostsPage,
  type UpdatePostInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import {
  NOTIFICATION_PORT,
  type NotificationPort,
} from '../../core/notifications/notification.port';

const MAX_PAGE = 50;
const DEFAULT_PAGE = 20;
/** Best-effort cap on how many past donors get emailed for one campaign post
 *  — a community post is not a mailing-list feature; this is a courtesy
 *  notification to people who have already supported this specific org. */
const MAX_CAMPAIGN_NOTIFY_RECIPIENTS = 100;

/** Clamp a requested page size to [1, MAX_PAGE] — shared by every list read
 *  in this module. */
export function clampLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return DEFAULT_PAGE;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE);
}

type PostWithImages = PostRow & { images: PostImageRow[] };

/** Row emitted by the SECURITY DEFINER functions (camelCase — I control the
 *  jsonb_build_object keys, so no snake_case mapping is needed here, unlike
 *  a genuine Prisma-model row). */
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
 * M11 (comunidad) — publicaciones. El feed es CRUZADO por diseño (todas las
 * organizaciones + publicaciones de plataforma); ver `community.prisma` para
 * el criterio de `organizationId`. Una cuenta de organización publica bajo su
 * propio tenant (RLS normal); una Persona publica vía la función SECURITY
 * DEFINER `create_community_post_platform` (su fila no tiene organización, y
 * ninguna WITH CHECK de tenant_isolation la aceptaría bajo ningún contexto).
 */
@Injectable()
export class CommunityPostsService {
  private readonly logger = new Logger('CommunityPosts');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(NOTIFICATION_PORT) private readonly notifications: NotificationPort,
  ) {}

  private toImage(row: PostImageRow): PostImage {
    return {
      id: row.id,
      storageRef: row.storageRef,
      order: row.order,
      url: this.storage.resolvePublicUrl(row.storageRef),
    };
  }

  private toPost(row: PostWithImages): Post {
    return {
      id: row.id,
      organizationId: row.organizationId ?? undefined,
      authorUserId: row.authorUserId,
      authorName: row.authorName,
      type: row.type as PostType,
      title: row.title ?? undefined,
      body: row.body,
      images: [...row.images].sort((a, b) => a.order - b.order).map((i) => this.toImage(i)),
      commentCount: row.commentCount,
      likeCount: row.likeCount,
      status: row.status as Post['status'],
      moderationReason: row.moderationReason ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

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

  /** The actor's display name, resolved under their OWN tenant (works for
   *  both an org member and a Persona — every user has exactly one). */
  private async resolveAuthorName(actor: RequestUser): Promise<string> {
    const user = await this.prisma.withOrgContext(actor.organizationId, (tx) =>
      tx.user.findUnique({ where: { id: actor.id } }),
    );
    return user?.displayName ?? actor.email;
  }

  /** Publicar. Ramifica por tipo de cuenta: una organización publica bajo su
   *  propio tenant (RLS normal); una Persona publica sin organización, vía
   *  la función SECURITY DEFINER (ver nota de criterio en community.prisma). */
  async create(actor: RequestUser, input: CreatePostInput): Promise<CreatePostResult> {
    const authorName = await this.resolveAuthorName(actor);
    if (actor.accountType === 'person') {
      const post = await this.createPlatformPost(actor, authorName, input);
      return { post, imageUploads: [] };
    }
    return this.createOrgPost(actor, authorName, input);
  }

  private async createOrgPost(
    actor: RequestUser,
    authorName: string,
    input: CreatePostInput,
  ): Promise<CreatePostResult> {
    const organizationId = actor.organizationId;

    // Reserve storage targets OUTSIDE the tx (mirrors animals/marketplace create).
    // `uploadUrl` is the PUT-only target the client uploads bytes to; it is
    // NEVER persisted (only `storageRef`/the resolved view url are).
    const reserved = await Promise.all(
      (input.images ?? []).map(async (image, index) => {
        const stored = await this.storage.createUploadTarget({
          organizationId,
          filename: image.filename,
          contentType: image.contentType,
          // Community post photos are public (shown in the shared feed).
          visibility: 'public',
        });
        return { storageRef: stored.key, uploadUrl: stored.url, order: image.order ?? index };
      }),
    );

    const created = await this.prisma.withOrgContext(organizationId, async (tx) => {
      const row = await tx.post.create({
        data: {
          organizationId,
          authorUserId: actor.id,
          authorName,
          type: input.type,
          title: input.title ?? null,
          body: input.body,
          images:
            reserved.length > 0
              ? {
                  create: reserved.map((r) => ({
                    organizationId,
                    storageRef: r.storageRef,
                    order: r.order,
                  })),
                }
              : undefined,
        },
        include: { images: true },
      });

      if (input.type === PostType.Campaign) {
        const donations = await tx.donation.findMany({
          where: { organizationId, status: 'approved' },
          select: { payer: true },
        });
        const emails = Array.from(
          new Set(
            donations
              .map((d) => (d.payer as { email?: string } | null)?.email)
              .filter((email): email is string => !!email),
          ),
        ).slice(0, MAX_CAMPAIGN_NOTIFY_RECIPIENTS);
        return { post: this.toPost(row), images: row.images, notifyEmails: emails };
      }
      return { post: this.toPost(row), images: row.images, notifyEmails: [] as string[] };
    });

    if (created.notifyEmails.length > 0) {
      await this.notifyDonorsBestEffort(organizationId, created.post, created.notifyEmails);
    }

    const imageUploads = created.images.map((img) => {
      const match = reserved.find((r) => r.storageRef === img.storageRef);
      return {
        imageId: img.id,
        order: img.order,
        key: img.storageRef,
        url: match?.uploadUrl ?? '',
      };
    });
    return { post: created.post, imageUploads };
  }

  /** Best-effort email to the org's own past donors about a new campaign
   *  post — never blocks/fails the post creation itself. */
  private async notifyDonorsBestEffort(
    organizationId: string,
    post: Post,
    emails: string[],
  ): Promise<void> {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    const orgName = org?.name ?? 'una organización de AdoptaFácil';
    const subject = `${orgName} publicó novedades sobre una campaña`;
    const body = post.title ? `"${post.title}": ${post.body}` : post.body;
    for (const to of emails) {
      try {
        await this.notifications.send({ to, subject, body });
      } catch (error) {
        this.logger.warn(
          `No se pudo notificar a ${to} sobre la publicación ${post.id}: ${(error as Error).message}`,
        );
      }
    }
  }

  private async createPlatformPost(
    actor: RequestUser,
    authorName: string,
    input: CreatePostInput,
  ): Promise<Post> {
    // Platform-wide posts (no organization) never carry images reserved
    // under an org's storage bucket — out of scope for a Persona post in
    // this MVP (documented in the PR); images are for org-authored posts.
    const rows = await this.prisma.$queryRaw<Array<{ data: RawPost }>>(
      Prisma.sql`SELECT create_community_post_platform(${actor.id}::uuid, ${authorName}, ${input.type}, ${input.title ?? null}, ${input.body}) AS data`,
    );
    return this.fromRaw(rows[0].data);
  }

  /** El feed cruzado: publicaciones activas de todas las organizaciones +
   *  de plataforma, más recientes primero, filtro opcional por tipo. */
  async feed(limit: number, offset: number, type?: PostType): Promise<PostsPage> {
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    const rows = await this.prisma.$queryRaw<Array<{ data: { items: RawPost[]; total: number } }>>(
      Prisma.sql`SELECT community_posts_feed(${take}::int, ${skip}::int, ${type ?? null}::text) AS data`,
    );
    const data = rows[0]?.data ?? { items: [], total: 0 };
    return {
      items: (data.items ?? []).map((r) => this.fromRaw(r)),
      total: data.total ?? 0,
      limit: take,
      offset: skip,
    };
  }

  /** "Mis publicaciones": las propias, cualquier estado, por identidad de autor. */
  async mine(actor: RequestUser, limit: number, offset: number): Promise<PostsPage> {
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    const rows = await this.prisma.$queryRaw<Array<{ data: { items: RawPost[]; total: number } }>>(
      Prisma.sql`SELECT community_posts_by_author(${actor.id}::uuid, ${take}::int, ${skip}::int) AS data`,
    );
    const data = rows[0]?.data ?? { items: [], total: 0 };
    return {
      items: (data.items ?? []).map((r) => this.fromRaw(r)),
      total: data.total ?? 0,
      limit: take,
      offset: skip,
    };
  }

  /** Una publicación (activa), para permalink. */
  async get(id: string): Promise<Post> {
    const rows = await this.prisma.$queryRaw<Array<{ data: RawPost | null }>>(
      Prisma.sql`SELECT community_post_get(${id}::uuid) AS data`,
    );
    const raw = rows[0]?.data;
    if (!raw) {
      throw new NotFoundException('Post not found');
    }
    return this.fromRaw(raw);
  }

  /** Editar la publicación propia (solo título/cuerpo). */
  async update(actor: RequestUser, id: string, input: UpdatePostInput): Promise<Post> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ data: RawPost }>>(
        Prisma.sql`SELECT community_post_update_own(${id}::uuid, ${actor.id}::uuid, ${input.title ?? null}, ${input.body ?? null}) AS data`,
      );
      return this.fromRaw(rows[0].data);
    } catch (error) {
      throw this.translateOwnershipError(error);
    }
  }

  /** Borrar la publicación propia (física; cascada a fotos/comentarios/likes). */
  async remove(actor: RequestUser, id: string): Promise<void> {
    try {
      await this.prisma.$queryRaw(
        Prisma.sql`SELECT community_post_delete_own(${id}::uuid, ${actor.id}::uuid)`,
      );
    } catch (error) {
      throw this.translateOwnershipError(error);
    }
  }

  private translateOwnershipError(error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    if (/post not found/i.test(message)) {
      return new NotFoundException('Post not found');
    }
    if (/not the author/i.test(message)) {
      return new ForbiddenException('You are not the author of this post');
    }
    if (/cannot edit a removed post/i.test(message)) {
      return new ForbiddenException(
        'This post was removed by moderation and can no longer be edited',
      );
    }
    return error instanceof Error ? error : new Error(message);
  }
}

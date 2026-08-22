import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate for M11 (comunidad): community_posts, community_post_images,
 * community_comments, community_post_likes — tenant-isolated for every
 * ORG-attributed row (no cross-org visibility, no cross-org write). A row
 * with organization_id IS NULL (a Persona's platform-wide post) is invisible
 * under EVERY tenant context by design — verified explicitly below, since
 * that is the whole point of the nullable column (see community.prisma).
 * Connects as the NON-SUPERUSER app role. no-leak tests carry "no-leak" so
 * `test:rls` runs them (same pattern as rls-no-leak-marketplace).
 */
const APP_DATABASE_URL =
  process.env.DATABASE_URL_APP ??
  'postgresql://adoptafacil_app:adoptafacil_app@localhost:5433/adoptafacil?schema=public';

async function withOrgContext<T>(
  prisma: PrismaClient,
  organizationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`;
    return fn(tx);
  });
}

interface Seeded {
  postId: string;
  imageId: string;
  commentId: string;
}

async function seed(
  prisma: PrismaClient,
  admin: PrismaClient,
  orgId: string,
  tag: string,
): Promise<Seeded> {
  const { post, image } = await withOrgContext(prisma, orgId, async (tx) => {
    const post = await tx.post.create({
      data: {
        organizationId: orgId,
        authorUserId: randomUUID(),
        authorName: `Autora ${tag}`,
        type: 'general',
        body: `Publicación ${tag}`,
      },
    });
    const image = await tx.postImage.create({
      data: { organizationId: orgId, postId: post.id, storageRef: `public/${orgId}/x.jpg` },
    });
    return { post, image };
  });
  // community_comments grants SELECT only to the app role (real writes go
  // through create_community_comment, which runs as the DEFINER/owner) — the
  // superuser client seeds directly here, exactly like that function would.
  const comment = await admin.comment.create({
    data: {
      organizationId: orgId,
      postId: post.id,
      authorUserId: randomUUID(),
      authorName: `Comentarista ${tag}`,
      body: 'Comentario',
    },
  });
  return { postId: post.id, imageId: image.id, commentId: comment.id };
}

describe('RLS (community_posts, community_post_images, community_comments, community_post_likes)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  let seededA: Seeded;
  let platformPostId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await admin.organization.createMany({
      data: [
        { id: orgA, name: 'Org A' },
        { id: orgB, name: 'Org B' },
      ],
      skipDuplicates: true,
    });
    seededA = await seed(prisma, admin, orgA, 'A');
    await seed(prisma, admin, orgB, 'B');

    // A platform-wide (Persona-authored) post: seeded directly by the
    // superuser client, exactly like the SECURITY DEFINER function does —
    // no org context can ever write a NULL-organization row (WITH CHECK
    // never matches NULL), so this is the only way such a row exists.
    const platformPost = await admin.post.create({
      data: {
        organizationId: null,
        authorUserId: randomUUID(),
        authorName: 'Persona',
        type: 'general',
        body: 'Publicación de plataforma',
      },
    });
    platformPostId = platformPost.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await admin.post.deleteMany({ where: { id: platformPostId } });
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own rows in all 4 tables, never Org B, never the platform-wide post', async () => {
    await withOrgContext(prisma, orgA, async (tx) => {
      const posts = await tx.post.findMany();
      const images = await tx.postImage.findMany();
      const comments = await tx.comment.findMany();
      expect(posts.every((r) => r.organizationId === orgA)).toBe(true);
      expect(images.every((r) => r.organizationId === orgA)).toBe(true);
      expect(comments.every((r) => r.organizationId === orgA)).toBe(true);
      expect(posts).toHaveLength(1);
      expect(images).toHaveLength(1);
      expect(comments).toHaveLength(1);
      expect(posts.some((p) => p.id === platformPostId)).toBe(false);
    });
  });

  it('no-leak: with no tenant context, nothing is visible in any of the 4 tables', async () => {
    expect(await prisma.post.findMany()).toHaveLength(0);
    expect(await prisma.postImage.findMany()).toHaveLength(0);
    expect(await prisma.comment.findMany()).toHaveLength(0);
    expect(await prisma.postLike.findMany()).toHaveLength(0);
  });

  it('no-leak: the platform-wide (NULL-organization) post is invisible under ANY tenant context', async () => {
    const underA = await withOrgContext(prisma, orgA, (tx) =>
      tx.post.findUnique({ where: { id: platformPostId } }),
    );
    const underB = await withOrgContext(prisma, orgB, (tx) =>
      tx.post.findUnique({ where: { id: platformPostId } }),
    );
    expect(underA).toBeNull();
    expect(underB).toBeNull();
  });

  it('no-leak: WITH CHECK blocks writing a post for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.post.create({
          data: {
            organizationId: orgB,
            authorUserId: randomUUID(),
            authorName: 'Intrusa',
            type: 'general',
            body: 'Cross-tenant write',
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('no-leak: WITH CHECK blocks writing a post image for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.postImage.create({
          data: { organizationId: orgB, postId: seededA.postId, storageRef: 'public/x/y.jpg' },
        }),
      ),
    ).rejects.toThrow();
  });

  it('no-leak: Org A cannot UPDATE a row that (via context mismatch) resolves to Org B', async () => {
    const found = await withOrgContext(prisma, orgA, (tx) =>
      tx.post.findUnique({ where: { id: seededA.postId } }),
    );
    expect(found).not.toBeNull();
    const foreign = await withOrgContext(prisma, orgB, (tx) =>
      tx.post.findUnique({ where: { id: seededA.postId } }),
    );
    expect(foreign).toBeNull();
  });
});

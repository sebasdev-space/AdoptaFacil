import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * M12 reputation (RF23) end-to-end: create a review (pending, not public yet)
 * → duplicate blocked → PlatformAdmin moderation queue → approve/reject
 * (reason mandatory to reject) → public indicators (average/count, only
 * approved) → anonymity respected → approved -> hidden after a report →
 * content is immutable forever → RBAC deny-by-default for moderation,
 * including the reviewed organization itself.
 */
describe('Reviews / reputation (M12, RF23)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password123';

  interface Actor {
    token: string;
    orgId: string;
    userId: string;
  }

  async function registerOrg(name: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: name,
        displayName: 'Owner',
        email: `s7-o-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    orgIds.push(res.body.user.organizationId);
    return {
      token: res.body.tokens.accessToken,
      orgId: res.body.user.organizationId,
      userId: res.body.user.id,
    };
  }

  async function registerPerson(tag: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/person')
      .send({
        displayName: `Reseñador ${tag}`,
        email: `s7-p-${tag}-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    orgIds.push(res.body.user.organizationId);
    return {
      token: res.body.tokens.accessToken,
      orgId: res.body.user.organizationId,
      userId: res.body.user.id,
    };
  }

  /** Platform moderators aren't a registration path — same technique as
   *  `organization-duplicates.integration-spec.ts`: register an org, then
   *  replace its roles directly via the admin (superuser) connection. */
  async function actorWithPlatformRole(role: string): Promise<Actor> {
    const actor = await registerOrg(`Plataforma ${randomUUID().slice(0, 6)}`);
    await admin.userRole.deleteMany({ where: { userId: actor.userId } });
    await admin.userRole.create({
      data: { organizationId: actor.orgId, userId: actor.userId, role },
    });
    return actor;
  }

  const setSlug = (token: string, slug: string) =>
    request(server).put('/org/profile').set('Authorization', `Bearer ${token}`).send({ slug });

  const createReview = (token: string, body: Record<string, unknown>) =>
    request(server).post('/reviews').set('Authorization', `Bearer ${token}`).send(body);

  const listMine = (token: string) =>
    request(server).get('/reviews/mine').set('Authorization', `Bearer ${token}`);

  const queue = (token: string) =>
    request(server).get('/platform/reviews/queue').set('Authorization', `Bearer ${token}`);

  const decide = (token: string, id: string, body: Record<string, unknown>) =>
    request(server)
      .post(`/platform/reviews/${id}/decision`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const hide = (token: string, id: string, body: Record<string, unknown>) =>
    request(server)
      .post(`/platform/reviews/${id}/hide`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const publicSummary = (slug: string) =>
    request(server).get(`/public/organizations/${slug}/reputation-summary`);

  const publicReviews = (slug: string) =>
    request(server).get(`/public/organizations/${slug}/reviews`);

  let org: Actor;
  let platformAdmin: Actor;
  let author1: Actor;
  let author2: Actor;
  let author3: Actor;
  let slug: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    org = await registerOrg('Refugio Reputación');
    platformAdmin = await actorWithPlatformRole('platform_admin');
    author1 = await registerPerson('1');
    author2 = await registerPerson('2');
    author3 = await registerPerson('3');

    slug = `s7-slug-${randomUUID().slice(0, 8)}`;
    await setSlug(org.token, slug).expect(200);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('creates a review as pending — not visible in the public summary/list yet', async () => {
    const created = await createReview(author1.token, {
      organizationId: org.orgId,
      rating: 5,
      comment: 'Excelente organización, muy transparente.',
    }).expect(201);

    expect(created.body).toMatchObject({
      organizationId: org.orgId,
      authorUserId: author1.userId,
      rating: 5,
      comment: 'Excelente organización, muy transparente.',
      isAnonymous: false,
      status: 'pending',
    });
    expect(created.body.rejectionReason).toBeUndefined();
    expect(created.body.moderatedByUserId).toBeUndefined();

    const summary = await publicSummary(slug).expect(200);
    expect(summary.body).toEqual({
      organizationId: org.orgId,
      averageRating: 0,
      approvedReviewsCount: 0,
    });

    const list = await publicReviews(slug).expect(200);
    expect(list.body.items).toHaveLength(0);
  });

  it('rejects a second review by the same author on the same organization', async () => {
    await createReview(author1.token, { organizationId: org.orgId, rating: 3 }).expect(400);
  });

  it('a non-PlatformAdmin (including the reviewed organization itself) cannot reach the moderation queue or decide (403)', async () => {
    await queue(org.token).expect(403);
    await queue(author1.token).expect(403);

    const mine = await listMine(author1.token).expect(200);
    const pendingId = mine.body[0].id as string;
    await decide(org.token, pendingId, { decision: 'approve' }).expect(403);
    await decide(author1.token, pendingId, { decision: 'approve' }).expect(403);
  });

  it('PlatformAdmin sees the pending review in the queue with author + org identity', async () => {
    const items = await queue(platformAdmin.token).expect(200);
    const item = items.body.find(
      (r: { authorUserId: string }) => r.authorUserId === author1.userId,
    );
    expect(item).toMatchObject({
      organizationId: org.orgId,
      organizationName: 'Refugio Reputación',
      authorName: 'Reseñador 1',
      status: 'pending',
    });
  });

  it('rejecting without a reason is rejected (mandatory reason)', async () => {
    const mine = await listMine(author1.token).expect(200);
    const pendingId = mine.body[0].id as string;
    await decide(platformAdmin.token, pendingId, { decision: 'reject' }).expect(400);
  });

  it('PlatformAdmin approves a pending review — now visible publicly and counted in the average', async () => {
    const mine = await listMine(author1.token).expect(200);
    const pendingId = mine.body[0].id as string;

    const decided = await decide(platformAdmin.token, pendingId, { decision: 'approve' }).expect(
      200,
    );
    expect(decided.body).toMatchObject({
      id: pendingId,
      status: 'approved',
      moderatedByUserId: platformAdmin.userId,
    });

    const summary = await publicSummary(slug).expect(200);
    expect(summary.body).toEqual({
      organizationId: org.orgId,
      averageRating: 5,
      approvedReviewsCount: 1,
    });

    const list = await publicReviews(slug).expect(200);
    expect(list.body.items).toEqual([
      expect.objectContaining({
        rating: 5,
        comment: 'Excelente organización, muy transparente.',
        authorName: 'Reseñador 1',
      }),
    ]);
  });

  it('an anonymous review hides the author name publicly, but the real author stays visible to PlatformAdmin', async () => {
    await createReview(author2.token, {
      organizationId: org.orgId,
      rating: 2,
      comment: 'Podría mejorar la comunicación.',
      isAnonymous: true,
    }).expect(201);

    const mine = await listMine(author2.token).expect(200);
    const pendingId = mine.body[0].id as string;

    const queued = await queue(platformAdmin.token).expect(200);
    const item = queued.body.find((r: { id: string }) => r.id === pendingId);
    expect(item).toMatchObject({ isAnonymous: true, authorName: 'Reseñador 2' });

    await decide(platformAdmin.token, pendingId, { decision: 'approve' }).expect(200);

    const list = await publicReviews(slug).expect(200);
    const publicItem = list.body.items.find((r: { rating: number }) => r.rating === 2);
    expect(publicItem.authorName).toBeUndefined();

    const summary = await publicSummary(slug).expect(200);
    expect(summary.body).toEqual({
      organizationId: org.orgId,
      averageRating: 3.5,
      approvedReviewsCount: 2,
    });
  });

  it('PlatformAdmin rejects a review with a reason — never becomes public, and no resubmission is allowed', async () => {
    await createReview(author3.token, { organizationId: org.orgId, rating: 1 }).expect(201);
    const mine = await listMine(author3.token).expect(200);
    const pendingId = mine.body[0].id as string;

    const decided = await decide(platformAdmin.token, pendingId, {
      decision: 'reject',
      reason: 'Contenido inapropiado.',
    }).expect(200);
    expect(decided.body).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Contenido inapropiado.',
    });

    const list = await publicReviews(slug).expect(200);
    expect(list.body.items.some((r: { rating: number }) => r.rating === 1)).toBe(false);

    // No edit/replace flow (TODO(client) if one is required) — a rejected
    // review permanently occupies the (organization, author) slot.
    await createReview(author3.token, { organizationId: org.orgId, rating: 4 }).expect(400);
  });

  it('a review already decided cannot be decided again', async () => {
    const mine = await listMine(author1.token).expect(200);
    const decidedId = mine.body[0].id as string;
    await decide(platformAdmin.token, decidedId, { decision: 'reject', reason: 'x' }).expect(400);
  });

  it('the content of a submitted review can never be mutated — not for a superuser, not even a direct DB write', async () => {
    const mine = await listMine(author1.token).expect(200);
    const reviewId = mine.body[0].id as string;

    await expect(
      admin.$executeRawUnsafe('UPDATE reviews SET rating = 1 WHERE id = $1::uuid', reviewId),
    ).rejects.toThrow(/immutable/i);
  });

  it('hides an approved review after a later report — reason mandatory, only PlatformAdmin, only from approved', async () => {
    const mine = await listMine(author1.token).expect(200);
    const approvedId = mine.body[0].id as string; // author1's review, approved above

    await hide(org.token, approvedId, { reason: 'x' }).expect(403);
    await hide(platformAdmin.token, approvedId, {}).expect(400);

    const hidden = await hide(platformAdmin.token, approvedId, {
      reason: 'Reportada por contenido falso.',
    }).expect(200);
    expect(hidden.body).toMatchObject({
      status: 'hidden',
      rejectionReason: 'Reportada por contenido falso.',
    });

    // Hiding a non-approved review is rejected (already hidden here).
    await hide(platformAdmin.token, approvedId, { reason: 'de nuevo' }).expect(400);

    const summary = await publicSummary(slug).expect(200);
    expect(summary.body).toEqual({
      organizationId: org.orgId,
      averageRating: 2,
      approvedReviewsCount: 1,
    });
  });

  it('"Mis reseñas" shows the author their own reviews with organization name and current status', async () => {
    const mine = await listMine(author1.token).expect(200);
    expect(mine.body).toEqual([
      expect.objectContaining({
        organizationId: org.orgId,
        organizationName: 'Refugio Reputación',
        status: 'hidden',
      }),
    ]);
  });

  it('an unknown organization is rejected with 404', async () => {
    await createReview(author1.token, { organizationId: randomUUID(), rating: 5 }).expect(404);
  });

  it('a rating outside 1-5 is rejected before ever reaching the database', async () => {
    await createReview(author1.token, { organizationId: org.orgId, rating: 6 }).expect(400);
    await createReview(author1.token, { organizationId: org.orgId, rating: 0 }).expect(400);
  });
});

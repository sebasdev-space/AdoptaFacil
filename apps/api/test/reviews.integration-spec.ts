import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * M12 reputation (RF23) end-to-end: an author needs a REAL interaction with
 * the organization first (approved adoption | approved donation | paid
 * sponsorship period — QA-reported gap, fixed here) → create a review
 * (pending, not public yet) → duplicate blocked → PlatformAdmin moderation
 * queue → approve/reject (reason mandatory to reject) → public indicators
 * (average/count, only approved) → anonymity respected → approved -> hidden
 * after a report → content is immutable forever → RBAC deny-by-default for
 * moderation, including the reviewed organization itself.
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

  // ---------------------------------------------------------------------
  // Fixtures for the "real interaction" gate (RF23 fix, T-review-interaction).
  // `create_review` now requires the author to have had at least ONE of an
  // approved adoption, an approved donation or a paid sponsorship period with
  // the reviewed organization. Driving the full flows (kanban transitions,
  // gateway webhook, the daily billing job) for every test would be a lot of
  // machinery for a fixture, so — same spirit as `actorWithPlatformRole`
  // above — these write the resulting row directly via the admin (superuser)
  // connection, which is exactly the state those flows would have produced.
  // ---------------------------------------------------------------------
  async function grantApprovedAdoption(orgId: string, userId: string): Promise<void> {
    await admin.adoptionRequest.create({
      data: {
        organizationId: orgId,
        animalId: randomUUID(),
        animalSnapshot: { name: 'Firulais', species: 'dog' },
        applicantUserId: userId,
        applicant: { fullName: 'Adoptante Fixture', email: 'adoptante-fixture@test.local' },
        message: 'Fixture RF23: adopción ya aprobada para habilitar la reseña.',
        status: 'approved',
      },
    });
  }

  async function grantApprovedDonation(orgId: string, userId: string): Promise<void> {
    await admin.donation.create({
      data: {
        organizationId: orgId,
        donorUserId: userId,
        conceptKind: 'organization',
        conceptId: orgId,
        commissionPayer: 'organization',
        intendedAmount: 20000,
        amountCharged: 20000,
        breakdown: { intendedAmount: 20000, commission: 800, vat: 152, net: 19200 },
        collectionId: `s7-fixture-col-${randomUUID()}`,
        idempotencyKey: `s7-fixture-idem-${randomUUID()}`,
        status: 'approved',
      },
    });
  }

  async function grantPaidSponsorship(orgId: string, userId: string): Promise<void> {
    // Unlike adoption_requests/donations, `sponsorship_plans.animal_id` has a
    // REAL FK to `animals` — needs an actual row, not just a random uuid.
    const animal = await admin.animal.create({
      data: { organizationId: orgId, name: 'Fixture RF23', species: 'dog' },
    });
    const plan = await admin.sponsorshipPlan.create({
      data: {
        organizationId: orgId,
        animalId: animal.id,
        name: 'Plan fixture RF23',
        amount: 15000,
      },
    });
    const sponsorship = await admin.sponsorship.create({
      data: {
        organizationId: orgId,
        planId: plan.id,
        animalId: plan.animalId,
        sponsorUserId: userId,
      },
    });
    // Real interaction requires a PAID period, not just the subscription row
    // (see the migration's comment: a fresh/failed subscription is not yet a
    // real transaction).
    await admin.sponsorshipPayment.create({
      data: {
        organizationId: orgId,
        sponsorshipId: sponsorship.id,
        period: '2026-09',
        status: 'paid',
        paidAt: new Date(),
      },
    });
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
  let author4: Actor;
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
    author4 = await registerPerson('4');

    // author1/2/3 each get ONE of the three qualifying interactions with
    // `org` (RF23 fix) so their existing review scenarios below keep
    // working; author4 gets none, for the negative test.
    await grantApprovedAdoption(org.orgId, author1.userId);
    await grantApprovedDonation(org.orgId, author2.userId);
    await grantPaidSponsorship(org.orgId, author3.userId);

    slug = `s7-slug-${randomUUID().slice(0, 8)}`;
    await setSlug(org.token, slug).expect(200);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('rejects a review from an author with NO adoption/donation/sponsorship with the organization (RF23 fix)', async () => {
    const res = await createReview(author4.token, {
      organizationId: org.orgId,
      rating: 5,
    }).expect(400);
    expect(res.body.message).toMatch(/adopción, donación o apadrinamiento/i);
  });

  it('creates a review as pending (author has an APPROVED ADOPTION with the org) — not visible in the public summary/list yet', async () => {
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

  it('an anonymous review hides the author name publicly, but the real author stays visible to PlatformAdmin (author has an APPROVED DONATION with the org)', async () => {
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

  it('PlatformAdmin rejects a review with a reason — never becomes public, and no resubmission is allowed (author has a PAID SPONSORSHIP with the org)', async () => {
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

import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * M12 reputation (S7-b, client-requested): the portal-público "Registrar
 * reseña" button — NO session, always anonymous, visible immediately
 * (`approved` from the start, never `pending`/PlatformAdmin queue). Its only
 * moderator is the Owner/Administrator of the REVIEWED organization
 * ("marcar como spam"), a deliberate, narrow exception to RF23's "the
 * reviewed org never moderates its own reviews" rule — scoped to ONLY this
 * kind of review (never the authenticated/verified one from `reviews.integration-spec.ts`).
 */
describe('Reviews / portal público sin sesión (M12, S7-b)', () => {
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
        email: `s7b-o-${randomUUID()}@test.local`,
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
        displayName: `Actor ${tag}`,
        email: `s7b-p-${tag}-${randomUUID()}@test.local`,
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

  const createPublicReview = (slug: string, body: Record<string, unknown>) =>
    request(server).post(`/public/organizations/${slug}/reviews`).send(body);

  const publicSummary = (slug: string) =>
    request(server).get(`/public/organizations/${slug}/reputation-summary`);

  const publicReviews = (slug: string) =>
    request(server).get(`/public/organizations/${slug}/reviews`);

  const markSpam = (token: string, id: string) =>
    request(server).post(`/reviews/${id}/mark-spam`).set('Authorization', `Bearer ${token}`);

  const createAuthenticatedReview = (token: string, body: Record<string, unknown>) =>
    request(server).post('/reviews').set('Authorization', `Bearer ${token}`).send(body);

  const queue = (token: string) =>
    request(server).get('/platform/reviews/queue').set('Authorization', `Bearer ${token}`);

  let org: Actor;
  let otherOrgOwner: Actor;
  let platformAdmin: Actor;
  let slug: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    org = await registerOrg('Refugio Portal Público');
    otherOrgOwner = await registerOrg('Otro Refugio');
    platformAdmin = await actorWithPlatformRole('platform_admin');

    slug = `s7b-slug-${randomUUID().slice(0, 8)}`;
    await setSlug(org.token, slug).expect(200);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('an unknown slug is rejected with 404', async () => {
    await createPublicReview('slug-que-no-existe', { rating: 5 }).expect(404);
  });

  it('a rating outside 1-5 is rejected before ever reaching the database', async () => {
    await createPublicReview(slug, { rating: 6 }).expect(400);
    await createPublicReview(slug, { rating: 0 }).expect(400);
  });

  it('creates a review with NO Authorization header, no organizationId in the body, and it is visible on the portal IMMEDIATELY (no PlatformAdmin approval step)', async () => {
    const created = await createPublicReview(slug, {
      rating: 4,
      comment: 'Muy buen trabajo con los animales.',
    }).expect(201);

    expect(created.body).toMatchObject({
      organizationId: org.orgId,
      rating: 4,
      comment: 'Muy buen trabajo con los animales.',
      isAnonymous: true,
      status: 'approved',
    });
    expect(created.body.authorUserId).toBeUndefined();

    const summary = await publicSummary(slug).expect(200);
    expect(summary.body).toEqual({
      organizationId: org.orgId,
      averageRating: 4,
      approvedReviewsCount: 1,
    });

    const list = await publicReviews(slug).expect(200);
    expect(list.body.items).toEqual([
      expect.objectContaining({ rating: 4, comment: 'Muy buen trabajo con los animales.' }),
    ]);
    expect(list.body.items[0].authorName).toBeUndefined();
  });

  it('never reaches the PlatformAdmin moderation queue — the Owner is its only moderator', async () => {
    const items = await queue(platformAdmin.token).expect(200);
    expect(items.body.some((r: { organizationId: string }) => r.organizationId === org.orgId)).toBe(
      false,
    );
  });

  it("the reviewed organization's Owner CANNOT mark it spam from another organization's account (tenant isolation)", async () => {
    const list = await publicReviews(slug).expect(200);
    const mine = await admin.review.findFirst({ where: { organizationId: org.orgId } });
    expect(mine).not.toBeNull();

    await markSpam(otherOrgOwner.token, mine!.id).expect(404);
    // Confirms it is still there, untouched.
    const stillThere = await publicReviews(slug).expect(200);
    expect(stillThere.body.items).toHaveLength(list.body.items.length);
  });

  it("the reviewed organization's Owner marks the public review as spam — it disappears from the portal", async () => {
    const before = await admin.review.findFirst({ where: { organizationId: org.orgId } });

    const marked = await markSpam(org.token, before!.id).expect(200);
    expect(marked.body).toMatchObject({ status: 'hidden', rejectionReason: 'spam' });

    const summary = await publicSummary(slug).expect(200);
    expect(summary.body).toEqual({
      organizationId: org.orgId,
      averageRating: 0,
      approvedReviewsCount: 0,
    });
    const list = await publicReviews(slug).expect(200);
    expect(list.body.items).toHaveLength(0);
  });

  it('marking an already-hidden review as spam again is rejected', async () => {
    const hidden = await admin.review.findFirst({
      where: { organizationId: org.orgId, status: 'hidden' },
    });
    await markSpam(org.token, hidden!.id).expect(400);
  });

  it('the Owner can never mark spam on a VERIFIED/authenticated review (RF23 conflict-of-interest rule stays intact)', async () => {
    const author = await registerPerson('verificado');
    await admin.donation.create({
      data: {
        organizationId: org.orgId,
        donorUserId: author.userId,
        conceptKind: 'organization',
        conceptId: org.orgId,
        commissionPayer: 'organization',
        intendedAmount: 20000,
        amountCharged: 20000,
        breakdown: { intendedAmount: 20000, commission: 800, vat: 152, net: 19200 },
        collectionId: `s7b-fixture-col-${randomUUID()}`,
        idempotencyKey: `s7b-fixture-idem-${randomUUID()}`,
        status: 'approved',
      },
    });

    const created = await createAuthenticatedReview(author.token, {
      organizationId: org.orgId,
      rating: 5,
    }).expect(201);

    await markSpam(org.token, created.body.id).expect(400);
  });
});

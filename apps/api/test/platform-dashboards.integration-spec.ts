import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { computeBreakdown } from '@adoptafacil/contracts';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * M13 dashboards (RF24, S-8): PlatformAdmin consolidates the three existing
 * queue counts exactly (compared live against each queue's own endpoint,
 * never a fixed expected number — robust regardless of other tests' data);
 * PlatformSuperAdmin exposes the platform-wide financial/business/geography
 * aggregation, verified via DELTA (before/after one known fixture) since the
 * shared integration DB may carry other approved donations/animals/etc. from
 * other test files. RBAC: a normal PlatformAdmin gets 403 on the SuperAdmin
 * dashboard.
 */
describe('Platform dashboards (M13, RF24, S-8)', () => {
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
        email: `s8-o-${randomUUID()}@test.local`,
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
        displayName: `Persona ${tag}`,
        email: `s8-p-${tag}-${randomUUID()}@test.local`,
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

  const adminSummary = (token: string) =>
    request(server).get('/platform/dashboard/admin').set('Authorization', `Bearer ${token}`);

  const superAdminSummary = (token: string) =>
    request(server).get('/platform/dashboard/super-admin').set('Authorization', `Bearer ${token}`);

  const documentsQueue = (token: string) =>
    request(server).get('/platform/documents/queue').set('Authorization', `Bearer ${token}`);

  const duplicatesQueue = (token: string) =>
    request(server).get('/platform/duplicates/queue').set('Authorization', `Bearer ${token}`);

  const reviewsQueue = (token: string) =>
    request(server).get('/platform/reviews/queue').set('Authorization', `Bearer ${token}`);

  let org: Actor;
  let platformAdmin: Actor;
  let platformSuperAdmin: Actor;
  let person: Actor;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    org = await registerOrg('Refugio Dashboards');
    platformAdmin = await actorWithPlatformRole('platform_admin');
    platformSuperAdmin = await actorWithPlatformRole('platform_super_admin');
    person = await registerPerson('a');
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('a non-platform role (including the org Owner) gets 403 on both dashboards', async () => {
    await adminSummary(org.token).expect(403);
    await superAdminSummary(org.token).expect(403);
    await adminSummary(person.token).expect(403);
  });

  it('a normal PlatformAdmin gets 403 on the SuperAdmin financial dashboard', async () => {
    await adminSummary(platformAdmin.token).expect(200);
    await superAdminSummary(platformAdmin.token).expect(403);
  });

  it("PlatformAdmin's consolidated counts match each queue's own current length exactly", async () => {
    // Create one pending item in each queue so none of the three is trivially 0.
    await request(server)
      .post('/reviews')
      .set('Authorization', `Bearer ${person.token}`)
      .send({ organizationId: org.orgId, rating: 4 })
      .expect(201);

    const [summary, documents, duplicates, reviews] = await Promise.all([
      adminSummary(platformAdmin.token).expect(200),
      documentsQueue(platformAdmin.token).expect(200),
      duplicatesQueue(platformAdmin.token).expect(200),
      reviewsQueue(platformAdmin.token).expect(200),
    ]);

    expect(summary.body).toEqual({
      pendingDocuments: documents.body.length,
      pendingDuplicateFlags: duplicates.body.length,
      pendingReviews: reviews.body.length,
    });
    // Sanity: the review we just created is actually reflected (not a
    // trivial 0 === 0 match).
    expect(reviews.body.length).toBeGreaterThan(0);
  });

  it('PlatformSuperAdmin sees the full shape with well-typed fields', async () => {
    const res = await superAdminSummary(platformSuperAdmin.token).expect(200);
    expect(res.body).toEqual({
      grossTotal: expect.any(Number),
      platformFeeTotal: expect.any(Number),
      gatewayFeeTotal: expect.any(Number),
      netTotal: expect.any(Number),
      organizationsByVerificationLevel: expect.any(Array),
      activeAnimals: expect.any(Number),
      totalAdoptions: expect.any(Number),
      activeCampaigns: expect.any(Number),
      activeSponsorships: expect.any(Number),
      organizationsByDepartment: expect.any(Array),
    });
  });

  it("the financial total moves by EXACTLY one approved donation's breakdown (delta, robust to other test data)", async () => {
    const before = await superAdminSummary(platformSuperAdmin.token).expect(200);

    const idempotencyKey = `s8-financial-${randomUUID()}`;
    const donation = await request(server)
      .post('/donations')
      .set('Authorization', `Bearer ${person.token}`)
      .send({
        organizationId: org.orgId,
        intendedAmount: 80_000,
        commissionPayer: 'organization',
        idempotencyKey,
      })
      .expect(201);
    await request(server)
      .post('/donations/webhook')
      .set('x-payment-signature', 'fake-sig')
      .send({
        collectionId: donation.body.collectionId,
        status: 'approved',
        eventId: `s8-evt-${randomUUID()}`,
      })
      .expect(200);

    const after = await superAdminSummary(platformSuperAdmin.token).expect(200);
    const expected = computeBreakdown(80_000, 'organization');

    expect(after.body.grossTotal - before.body.grossTotal).toBeCloseTo(expected.gross, 6);
    expect(after.body.platformFeeTotal - before.body.platformFeeTotal).toBeCloseTo(
      expected.platformFee + expected.platformIva,
      6,
    );
    expect(after.body.gatewayFeeTotal - before.body.gatewayFeeTotal).toBeCloseTo(
      expected.gatewayFee + expected.gatewayIva,
      6,
    );
    expect(after.body.netTotal - before.body.netTotal).toBeCloseTo(expected.net, 6);
  });

  it('activeAnimals and activeCampaigns move by exactly +1 when one of each is created (delta)', async () => {
    const before = await superAdminSummary(platformSuperAdmin.token).expect(200);

    await request(server)
      .post('/animals')
      .set('Authorization', `Bearer ${org.token}`)
      .send({ name: 'Firulais S8', species: 'dog', sex: 'male', size: 'medium' })
      .expect(201);
    await request(server)
      .post('/campaigns')
      .set('Authorization', `Bearer ${org.token}`)
      .send({
        title: 'Campaña S8',
        description: 'Campaña de prueba del dashboard',
        category: 'medications',
        goalAmount: 100_000,
        deadline: '2026-12-31T00:00:00.000Z',
      })
      .expect(201);

    const after = await superAdminSummary(platformSuperAdmin.token).expect(200);

    expect(after.body.activeAnimals - before.body.activeAnimals).toBe(1);
    expect(after.body.activeCampaigns - before.body.activeCampaigns).toBe(1);
  });

  it('organizationsByDepartment reflects a freshly-tagged department exactly (no collision risk)', async () => {
    const uniqueDept = `Depto-S8-${randomUUID()}`;
    await request(server)
      .put('/org/profile')
      .set('Authorization', `Bearer ${org.token}`)
      .send({ location: { department: uniqueDept } })
      .expect(200);

    const res = await superAdminSummary(platformSuperAdmin.token).expect(200);
    const entry = res.body.organizationsByDepartment.find(
      (d: { department: string }) => d.department === uniqueDept,
    );
    expect(entry).toEqual({ department: uniqueDept, count: 1 });
  });

  it('organizationsByVerificationLevel moves by +1 at level 0 for a freshly-registered (unverified) org', async () => {
    const before = await superAdminSummary(platformSuperAdmin.token).expect(200);
    const beforeLevel0 =
      before.body.organizationsByVerificationLevel.find((v: { level: number }) => v.level === 0)
        ?.count ?? 0;

    await registerOrg('Refugio S8 sin verificar');

    const after = await superAdminSummary(platformSuperAdmin.token).expect(200);
    const afterLevel0 =
      after.body.organizationsByVerificationLevel.find((v: { level: number }) => v.level === 0)
        ?.count ?? 0;

    expect(afterLevel0 - beforeLevel0).toBe(1);
  });
});

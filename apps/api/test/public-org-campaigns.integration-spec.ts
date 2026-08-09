import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * S2-07 public per-organization campaign feed: GET /public/organizations/:slug/campaigns
 * (no auth) exposes ONLY the ACTIVE campaigns of one org, resolved by its public
 * portal slug via the existing `organization_public` function. Mirrors the T-029
 * public adoption catalog test (exclusions, pagination + cap, 404, empty state,
 * no cross-tenant leak).
 */
describe('Public per-organization campaign feed (S2-07, RF15/RF16)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const password = 'password123';

  interface Actor {
    token: string;
    orgId: string;
    slug: string;
  }

  async function registerOrgWithSlug(): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: 'Refugio',
        displayName: 'Owner',
        email: `s207-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    const token = res.body.tokens.accessToken;
    const orgId = res.body.user.organizationId;
    createdOrgIds.push(orgId);
    const slug = `refugio-${randomUUID().slice(0, 8)}`;
    await request(server)
      .put('/org/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug })
      .expect(200);
    return { token, orgId, slug };
  }

  const createCampaign = (token: string, body: Record<string, unknown>) =>
    request(server)
      .post('/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        category: 'medications',
        goalAmount: 1_000_000,
        deadline: '2027-01-01T00:00:00.000Z',
        ...body,
      });

  const publicList = (slug: string, query = '') =>
    request(server).get(`/public/organizations/${slug}/campaigns${query}`);

  let orgA: Actor;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    orgA = await registerOrgWithSlug();

    // 2 active campaigns.
    await createCampaign(orgA.token, { title: 'Vacunas' }).expect(201);
    await createCampaign(orgA.token, { title: 'Techo del refugio' }).expect(201);

    // Cancelled campaign → excluded from the public feed.
    const cancelled = await createCampaign(orgA.token, { title: 'Cancelada' }).expect(201);
    await request(server)
      .patch(`/campaigns/${cancelled.body.id}`)
      .set('Authorization', `Bearer ${orgA.token}`)
      .send({ status: 'cancelled' })
      .expect(200);

    // Another org with its own active campaign → must never appear in orgA's feed.
    const orgB = await registerOrgWithSlug();
    await createCampaign(orgB.token, { title: 'SoloB' }).expect(201);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('returns only the active campaigns of the org, without a token', async () => {
    const res = await publicList(orgA.slug).expect(200);
    expect(res.body.total).toBe(2);
    expect(res.body.items).toHaveLength(2);
    const titles = res.body.items.map((c: { title: string }) => c.title).sort();
    expect(titles).toEqual(['Techo del refugio', 'Vacunas']);
    expect(titles).not.toContain('Cancelada');
    expect(titles).not.toContain('SoloB');
    expect(
      res.body.items.every(
        (c: { organizationId: string; status: string }) =>
          c.organizationId === orgA.orgId && c.status === 'active',
      ),
    ).toBe(true);
  });

  it('exposes the same public shape as GET /public/campaigns (organizationName, progress, no internal fields)', async () => {
    const res = await publicList(orgA.slug).expect(200);
    const vacunas = res.body.items.find((c: { title: string }) => c.title === 'Vacunas');
    expect(vacunas.organizationName).toBe('Refugio');
    expect(vacunas.progress).toBe(0);
    expect(vacunas.goalAmount).toBe(1_000_000);
    const keys = Object.keys(vacunas);
    expect(keys).not.toContain('updatedAt');
  });

  it('paginates with a server cap', async () => {
    const first = await publicList(orgA.slug, '?limit=1&offset=0').expect(200);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.total).toBe(2);
    expect(first.body.limit).toBe(1);

    const capped = await publicList(orgA.slug, '?limit=999').expect(200);
    expect(capped.body.limit).toBe(50);
    expect(capped.body.items).toHaveLength(2);
  });

  it('returns an empty list (not an error) for an org with no active campaigns', async () => {
    const empty = await registerOrgWithSlug();
    const res = await publicList(empty.slug).expect(200);
    expect(res.body.total).toBe(0);
    expect(res.body.items).toEqual([]);
  });

  it('returns 404 for an unknown slug (no public portal)', async () => {
    await publicList(`nope-${randomUUID().slice(0, 8)}`).expect(404);
  });
});

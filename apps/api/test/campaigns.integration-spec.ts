import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * M06 campaigns (RF15, T-053): tenant-scoped CRUD with the RBAC matrix, required
 * fields + integer-COP goal validation, public exposure (no session, public
 * columns only), tenant isolation, and audit. Money is never touched here.
 */
describe('Campaigns (M06, RF15: CRUD + RBAC + public exposure)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const password = 'password123';

  interface Actor {
    token: string;
    orgId: string;
    userId: string;
  }

  async function registerOrg(): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: 'Refugio',
        displayName: 'Owner',
        email: `t053-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    createdOrgIds.push(res.body.user.organizationId);
    return {
      token: res.body.tokens.accessToken,
      orgId: res.body.user.organizationId,
      userId: res.body.user.id,
    };
  }

  async function actorWithRoles(roles: string[]): Promise<Actor> {
    const actor = await registerOrg();
    await admin.userRole.deleteMany({ where: { userId: actor.userId } });
    for (const role of roles) {
      await admin.userRole.create({
        data: { organizationId: actor.orgId, userId: actor.userId, role },
      });
    }
    return actor;
  }

  const valid = {
    title: 'Vacunas de invierno',
    description: 'Campaña para vacunar 100 perros',
    category: 'medications',
    goalAmount: 500_000,
    deadline: '2026-12-31T00:00:00.000Z',
  };

  const createCampaign = (token: string, body: Record<string, unknown>) =>
    request(server).post('/campaigns').set('Authorization', `Bearer ${token}`).send(body);

  let owner: Actor;
  let orgB: Actor;
  let campaignId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    owner = await registerOrg();
    orgB = await registerOrg();
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('Owner creates a campaign (active, raised 0, audited)', async () => {
    const res = await createCampaign(owner.token, valid).expect(201);
    expect(res.body.status).toBe('active');
    expect(res.body.raisedAmount).toBe(0);
    expect(res.body.progress).toBe(0);
    expect(res.body.goalAmount).toBe(500_000);
    campaignId = res.body.id;

    const events = await admin.auditLog.findMany({
      where: { organizationId: owner.orgId, action: 'campaign.created' },
    });
    expect(events.length).toBe(1);
  });

  it('validates required fields and the integer-COP goal', async () => {
    const { goalAmount: _g, ...noGoal } = valid;
    await createCampaign(owner.token, noGoal).expect(400);
    const { deadline: _d, ...noDeadline } = valid;
    await createCampaign(owner.token, noDeadline).expect(400);
    const { category: _c, ...noCategory } = valid;
    await createCampaign(owner.token, noCategory).expect(400);
    await createCampaign(owner.token, { ...valid, goalAmount: 0 }).expect(400);
    await createCampaign(owner.token, { ...valid, goalAmount: 10.5 }).expect(400);
    await createCampaign(owner.token, { ...valid, category: 'marketing' }).expect(400);
  });

  it('RBAC: Operator ✓, Person ✗, ReadOnlyAuditor ✗ (create); Person ✗ (view)', async () => {
    const operator = await actorWithRoles(['operator']);
    await createCampaign(operator.token, valid).expect(201);

    const auditor = await actorWithRoles(['read_only_auditor']);
    await createCampaign(auditor.token, valid).expect(403);
    await request(server)
      .get('/campaigns')
      .set('Authorization', `Bearer ${auditor.token}`)
      .expect(200); // auditor may view

    const personRes = await request(server)
      .post('/auth/register/person')
      .send({ displayName: 'P', email: `t053-person-${randomUUID()}@test.local`, password })
      .expect(201);
    createdOrgIds.push(personRes.body.user.organizationId);
    await createCampaign(personRes.body.tokens.accessToken, valid).expect(403);
    await request(server)
      .get('/campaigns')
      .set('Authorization', `Bearer ${personRes.body.tokens.accessToken}`)
      .expect(403);
  });

  it('lists (paginated) and reads its own campaign', async () => {
    const list = await request(server)
      .get('/campaigns?limit=10&offset=0')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(list.body).toMatchObject({ limit: 10, offset: 0 });
    expect(list.body.items.some((c: { id: string }) => c.id === campaignId)).toBe(true);

    const detail = await request(server)
      .get(`/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(detail.body.id).toBe(campaignId);
  });

  it('is publicly visible (no session), exposing only public columns', async () => {
    const res = await request(server).get('/public/campaigns?limit=50').expect(200);
    const ours = res.body.items.find((c: { id: string }) => c.id === campaignId);
    expect(ours).toBeTruthy();
    expect(ours.organizationName).toEqual(expect.any(String));
    expect(ours).not.toHaveProperty('updatedAt'); // internal-only field never exposed

    const detail = await request(server).get(`/public/campaigns/${campaignId}`).expect(200);
    expect(detail.body.title).toBe(valid.title);
  });

  it('does not leak campaigns across tenants (RLS)', async () => {
    const list = await request(server)
      .get('/campaigns')
      .set('Authorization', `Bearer ${orgB.token}`)
      .expect(200);
    expect(
      list.body.items.every((c: { organizationId: string }) => c.organizationId === orgB.orgId),
    ).toBe(true);
    await request(server)
      .get(`/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${orgB.token}`)
      .expect(404);
  });

  it('changes status (audited) and drops the campaign from the public list', async () => {
    await request(server)
      .patch(`/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ status: 'cancelled' })
      .expect(200);

    const events = await admin.auditLog.findMany({
      where: { organizationId: owner.orgId, action: 'campaign.status_changed' },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);

    // Cancelled → gone from the public list and detail 404.
    const pub = await request(server).get('/public/campaigns?limit=50').expect(200);
    expect(pub.body.items.some((c: { id: string }) => c.id === campaignId)).toBe(false);
    await request(server).get(`/public/campaigns/${campaignId}`).expect(404);
  });
});

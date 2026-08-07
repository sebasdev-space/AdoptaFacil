import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * Sponsorships base end-to-end (RF17 · T-056): an org defines a plan for its
 * animal, a Person subscribes, the org suspends/reactivates it (state machine +
 * historial), plus the guardrails: money validation, RBAC deny-by-default, and
 * tenant isolation on the authenticated path. NO payment is created anywhere.
 */
describe('Sponsorships base (RF17 · T-056)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password123';

  let tokenA = '';
  let tokenB = '';
  let personToken = '';
  let personBToken = '';
  let animalId = '';
  let planId = '';

  async function registerOrg(tag: string): Promise<{ token: string; orgId: string }> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: `Refugio ${tag}`,
        displayName: `Owner ${tag}`,
        email: `t056-${tag}-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    return { token: res.body.tokens.accessToken, orgId: res.body.user.organizationId };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const a = await registerOrg('a');
    tokenA = a.token;
    orgIds.push(a.orgId);
    const b = await registerOrg('b');
    tokenB = b.token;
    orgIds.push(b.orgId);

    const person = await request(server)
      .post('/auth/register/person')
      .send({ displayName: 'Padrino', email: `t056-p-${randomUUID()}@test.local`, password })
      .expect(201);
    personToken = person.body.tokens.accessToken;
    orgIds.push(person.body.user.organizationId);

    const personB = await request(server)
      .post('/auth/register/person')
      .send({ displayName: 'Padrino B', email: `t056-pb-${randomUUID()}@test.local`, password })
      .expect(201);
    personBToken = personB.body.tokens.accessToken;
    orgIds.push(personB.body.user.organizationId);

    const animal = await request(server)
      .post('/animals')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Firu', species: 'dog', sex: 'unknown', size: 'medium' })
      .expect(201);
    animalId = animal.body.id;
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('Owner creates a plan for its OWN animal (integer COP, monthly)', async () => {
    const res = await request(server)
      .post('/sponsorship-plans')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ animalId, name: 'Padrinazgo mensual', amount: 30_000, periodicity: 'monthly' })
      .expect(201);
    expect(res.body.amount).toBe(30_000);
    expect(res.body.isActive).toBe(true);
    planId = res.body.id;
  });

  it('rejects a non-integer / non-positive amount (400)', async () => {
    await request(server)
      .post('/sponsorship-plans')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ animalId, name: 'X', amount: 100.5, periodicity: 'monthly' })
      .expect(400);
    await request(server)
      .post('/sponsorship-plans')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ animalId, name: 'X', amount: -1, periodicity: 'monthly' })
      .expect(400);
  });

  it('deny-by-default: a Person (no org roles anywhere) cannot create a plan (403)', async () => {
    await request(server)
      .post('/sponsorship-plans')
      .set('Authorization', `Bearer ${personToken}`)
      .send({ animalId, name: 'X', amount: 1000, periodicity: 'monthly' })
      .expect(403);
  });

  let sponsorshipId = '';

  it('a Person subscribes to the plan → sponsorship created ACTIVE, audited', async () => {
    const res = await request(server)
      .post('/sponsorships')
      .set('Authorization', `Bearer ${personToken}`)
      .send({ planId })
      .expect(201);
    expect(res.body.status).toBe('active');
    expect(res.body.planId).toBe(planId);
    expect(res.body.animalId).toBe(animalId);
    sponsorshipId = res.body.id;

    const audited = await admin.auditLog.findMany({
      where: { action: 'sponsorship.created', entityId: sponsorshipId },
    });
    expect(audited.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /sponsorships/mine (S2-03): the sponsor sees their own subscription, enriched with names', async () => {
    const res = await request(server)
      .get('/sponsorships/mine')
      .set('Authorization', `Bearer ${personToken}`)
      .expect(200);
    const mine = res.body.find((s: { id: string }) => s.id === sponsorshipId);
    expect(mine).toBeDefined();
    expect(mine.status).toBe('active');
    expect(mine.organizationName).toBe('Refugio a');
    expect(mine.planName).toBe('Padrinazgo mensual');
    expect(mine.planAmount).toBe(30_000);
    expect(mine.animalName).toBe('Firu');
  });

  it("GET /sponsorships/mine: no @Roles gate, but identity-scoped — a padrino with no subscriptions gets [] (never sees another sponsor's)", async () => {
    const res = await request(server)
      .get('/sponsorships/mine')
      .set('Authorization', `Bearer ${personBToken}`)
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('404 subscribing to an unknown/archived plan', async () => {
    await request(server)
      .post('/sponsorships')
      .set('Authorization', `Bearer ${personToken}`)
      .send({ planId: randomUUID() })
      .expect(404);
  });

  it('Owner suspends then reactivates → status changes, history records actor + timestamps', async () => {
    const suspended = await request(server)
      .post(`/sponsorships/${sponsorshipId}/suspend`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ reason: 'pausa temporal' })
      .expect(200);
    expect(suspended.body.status).toBe('suspended');
    expect(suspended.body.suspendedAt).toEqual(expect.any(String));

    const reactivated = await request(server)
      .post(`/sponsorships/${sponsorshipId}/reactivate`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({})
      .expect(200);
    expect(reactivated.body.status).toBe('active');

    const history = await request(server)
      .get(`/sponsorships/${sponsorshipId}/history`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(history.body.length).toBeGreaterThanOrEqual(3); // created, suspended, reactivated
    const bySuspend = history.body.find((h: { toStatus: string }) => h.toStatus === 'suspended');
    expect(bySuspend.reason).toBe('pausa temporal');
    expect(bySuspend.actorUserId).toEqual(expect.any(String));
    expect(bySuspend.createdAt).toEqual(expect.any(String));
  });

  it('rejects an invalid transition (reactivate an already-active sponsorship)', async () => {
    await request(server)
      .post(`/sponsorships/${sponsorshipId}/reactivate`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({})
      .expect(400);
  });

  it('rejects reactivating a CANCELLED sponsorship (terminal state)', async () => {
    await request(server)
      .post(`/sponsorships/${sponsorshipId}/cancel`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({})
      .expect(200);
    await request(server)
      .post(`/sponsorships/${sponsorshipId}/reactivate`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({})
      .expect(400);
  });

  it('GET /sponsorships/mine reflects lifecycle changes (now cancelled), not a stale snapshot', async () => {
    const res = await request(server)
      .get('/sponsorships/mine')
      .set('Authorization', `Bearer ${personToken}`)
      .expect(200);
    const mine = res.body.find((s: { id: string }) => s.id === sponsorshipId);
    expect(mine.status).toBe('cancelled');
  });

  it('deny-by-default: a Person cannot suspend a sponsorship (403)', async () => {
    await request(server)
      .post(`/sponsorships/${sponsorshipId}/suspend`)
      .set('Authorization', `Bearer ${personToken}`)
      .send({})
      .expect(403);
  });

  it("tenant isolation: Org B cannot see/manage Org A's plan or sponsorship (404)", async () => {
    await request(server)
      .get(`/sponsorship-plans/${planId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
    await request(server)
      .get(`/sponsorships/${sponsorshipId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
    await request(server)
      .post(`/sponsorships/${sponsorshipId}/suspend`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({})
      .expect(404);
  });

  it('the optional public summary exposes plans + sponsor COUNT (no PII), no session', async () => {
    const res = await request(server).get(`/public/sponsorships/animals/${animalId}`).expect(200);
    expect(res.body.animalId).toBe(animalId);
    expect(Array.isArray(res.body.activePlans)).toBe(true);
    expect(typeof res.body.activeSponsorCount).toBe('number');
    // No sponsor identity ever appears in the public payload.
    expect(JSON.stringify(res.body)).not.toContain('sponsorUserId');
  });
});

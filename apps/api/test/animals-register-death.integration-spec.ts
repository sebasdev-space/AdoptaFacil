import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * "Registrar fallecimiento" (M07 hallazgo QA en vivo): `POST
 * /animals/:id/register-death` was found to be a `ComingSoon` placeholder
 * with NO real backend behind it. This slice makes it real: marks the animal
 * deceased/inactive and auto-suspends every ACTIVE sponsorship of that animal
 * (reusing `SponsorshipsService.applySystemTransition`, the same
 * method/pattern the recurring-billing job uses for its own auto-suspension).
 * Same role gate as DELETE (`DELETE_ROLES`, Owner/Administrator only).
 */
describe('Animal death registration (M07 hallazgo QA, POST /animals/:id/register-death)', () => {
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

  async function registerOrg(tag: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: `Refugio ${tag}`,
        displayName: `Owner ${tag}`,
        email: `m07-death-${tag}-${randomUUID()}@test.local`,
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

  async function actorWithRoles(roles: string[]): Promise<Actor> {
    const actor = await registerOrg(`role-${roles.join('-')}`);
    await admin.userRole.deleteMany({ where: { userId: actor.userId } });
    for (const role of roles) {
      await admin.userRole.create({
        data: { organizationId: actor.orgId, userId: actor.userId, role },
      });
    }
    return actor;
  }

  async function registerPerson(tag: string): Promise<{ token: string; userId: string }> {
    const res = await request(server)
      .post('/auth/register/person')
      .send({ displayName: tag, email: `m07-death-p-${tag}-${randomUUID()}@test.local`, password })
      .expect(201);
    orgIds.push(res.body.user.organizationId);
    return { token: res.body.tokens.accessToken, userId: res.body.user.id };
  }

  async function createAnimal(token: string, name: string): Promise<string> {
    const res = await request(server)
      .post('/animals')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, species: 'dog', sex: 'unknown', size: 'medium' })
      .expect(201);
    return res.body.id;
  }

  async function createPlan(token: string, animalId: string): Promise<string> {
    const res = await request(server)
      .post('/sponsorship-plans')
      .set('Authorization', `Bearer ${token}`)
      .send({ animalId, name: 'Padrinazgo mensual', amount: 20_000, periodicity: 'monthly' })
      .expect(201);
    return res.body.id;
  }

  async function subscribe(personToken: string, planId: string): Promise<string> {
    const res = await request(server)
      .post('/sponsorships')
      .set('Authorization', `Bearer ${personToken}`)
      .send({ planId })
      .expect(201);
    return res.body.id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('Owner registers a death: animal → deceased/inactive, ACTIVE sponsorships → suspended with the deceased reason, audited', async () => {
    const owner = await registerOrg('a');
    const animalId = await createAnimal(owner.token, 'Firu');
    const planId = await createPlan(owner.token, animalId);
    const sponsor1 = await registerPerson('s1');
    const sponsor2 = await registerPerson('s2');
    const sponsorshipId1 = await subscribe(sponsor1.token, planId);
    const sponsorshipId2 = await subscribe(sponsor2.token, planId);

    // One sponsorship is ALREADY cancelled before the death is registered —
    // it must be left untouched (never re-visited, no duplicate history).
    await request(server)
      .post(`/sponsorships/${sponsorshipId2}/cancel`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({})
      .expect(200);

    const res = await request(server)
      .post(`/animals/${animalId}/register-death`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(201);

    expect(res.body.status).toBe('deceased');
    expect(res.body.isActive).toBe(false);

    const active = await request(server)
      .get(`/sponsorships/${sponsorshipId1}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(active.body.status).toBe('suspended');

    const history1 = await request(server)
      .get(`/sponsorships/${sponsorshipId1}/history`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    const suspendEntry = history1.body.find(
      (h: { toStatus: string }) => h.toStatus === 'suspended',
    );
    expect(suspendEntry.reason).toBe(
      'Apadrinamiento suspendido: el animal fue registrado como fallecido.',
    );
    expect(suspendEntry.actorUserId).toBeUndefined(); // system transition, not the human actor

    // The already-cancelled sponsorship keeps EXACTLY its prior history — no
    // second entry was appended for it.
    const stillCancelled = await request(server)
      .get(`/sponsorships/${sponsorshipId2}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(stillCancelled.body.status).toBe('cancelled');
    const history2 = await request(server)
      .get(`/sponsorships/${sponsorshipId2}/history`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(
      history2.body.filter((h: { toStatus: string }) => h.toStatus === 'suspended'),
    ).toHaveLength(0);

    const audited = await admin.auditLog.findMany({
      where: { organizationId: owner.orgId, action: 'animal.deceased', entityId: animalId },
    });
    expect(audited).toHaveLength(1);
    expect(audited[0].metadata).toMatchObject({ affectedSponsorshipsCount: 1 });
  });

  it('RBAC: Operator/Veterinarian cannot register a death (403) — same gate as DELETE', async () => {
    const owner = await registerOrg('rbac');
    const animalId = await createAnimal(owner.token, 'Firu2');
    const operator = await actorWithRoles(['operator']);
    const vet = await actorWithRoles(['veterinarian']);

    await request(server)
      .post(`/animals/${animalId}/register-death`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(403);
    await request(server)
      .post(`/animals/${animalId}/register-death`)
      .set('Authorization', `Bearer ${vet.token}`)
      .expect(403);
  });

  it('tenant isolation: Org B cannot register the death of an Org A animal (404)', async () => {
    const orgA = await registerOrg('tenant-a');
    const orgB = await registerOrg('tenant-b');
    const animalId = await createAnimal(orgA.token, 'Firu3');

    await request(server)
      .post(`/animals/${animalId}/register-death`)
      .set('Authorization', `Bearer ${orgB.token}`)
      .expect(404);

    const stillAlive = await request(server)
      .get(`/animals/${animalId}`)
      .set('Authorization', `Bearer ${orgA.token}`)
      .expect(200);
    expect(stillAlive.body.status).not.toBe('deceased');
  });

  it('an animal with no sponsorships is registered deceased with affectedSponsorshipsCount=0, no error', async () => {
    const owner = await registerOrg('none');
    const animalId = await createAnimal(owner.token, 'Solitario');

    const res = await request(server)
      .post(`/animals/${animalId}/register-death`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(201);
    expect(res.body.status).toBe('deceased');

    const audited = await admin.auditLog.findMany({
      where: { organizationId: owner.orgId, action: 'animal.deceased', entityId: animalId },
    });
    expect(audited[0].metadata).toMatchObject({ affectedSponsorshipsCount: 0 });
  });
});

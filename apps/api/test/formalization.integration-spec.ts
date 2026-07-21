import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * M01 formalization state machine (RF02): valid/invalid transitions, RBAC
 * (Owner only), append-only history, rteVigente coherence, same organization_id.
 */
describe('Formalization state machine (M01, RF02)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const password = 'password123';

  let ownerToken = '';
  let ownerOrgId = '';
  let owner2Token = '';
  let personToken = '';

  async function registerOrg(): Promise<{ token: string; orgId: string }> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: 'Org',
        displayName: 'Owner',
        email: `t102-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    createdOrgIds.push(res.body.user.organizationId);
    return { token: res.body.tokens.accessToken, orgId: res.body.user.organizationId };
  }

  const advance = (token: string, targetState: string, reason?: string) =>
    request(server)
      .post('/org/formalization/transitions')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetState, ...(reason ? { reason } : {}) });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const owner = await registerOrg();
    ownerToken = owner.token;
    ownerOrgId = owner.orgId;
    owner2Token = (await registerOrg()).token;

    const person = await request(server)
      .post('/auth/register/person')
      .send({ displayName: 'P', email: `t102-person-${randomUUID()}@test.local`, password })
      .expect(201);
    personToken = person.body.tokens.accessToken;
    createdOrgIds.push(person.body.user.organizationId);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('starts Informal for a fresh organization', async () => {
    const res = await request(server)
      .get('/org/formalization')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body).toEqual({ state: 'informal', rteVigente: false });
  });

  it('advances the Owner through the full chain, coherent rteVigente at ESAL_RTE', async () => {
    for (const target of ['en_proceso', 'formalizada', 'esal']) {
      const res = await advance(ownerToken, target).expect(201);
      expect(res.body.status.state).toBe(target);
      expect(res.body.status.rteVigente).toBe(false);
      expect(res.body.transition.organizationId).toBe(ownerOrgId);
      expect(res.body.transition.actorUserId).toEqual(expect.any(String));
    }
    const rte = await advance(ownerToken, 'esal_rte').expect(201);
    expect(rte.body.status).toEqual({ state: 'esal_rte', rteVigente: true });
  });

  it('records an append-only history preserving the same organization_id', async () => {
    const res = await request(server)
      .get('/org/formalization/history')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.length).toBe(4); // informal→en_proceso→formalizada→esal→esal_rte
    expect(res.body.every((t: { organizationId: string }) => t.organizationId === ownerOrgId)).toBe(
      true,
    );
    expect(res.body[0]).toMatchObject({ fromState: 'informal', toState: 'en_proceso' });
    expect(res.body[3]).toMatchObject({ fromState: 'esal', toState: 'esal_rte' });
  });

  it('rejects an invalid transition that skips states (400)', async () => {
    await advance(owner2Token, 'formalizada').expect(400); // from informal, skipping en_proceso
  });

  it('requires a reason to move backward (400 without, 201 with)', async () => {
    await advance(owner2Token, 'en_proceso').expect(201); // informal → en_proceso
    await advance(owner2Token, 'informal').expect(400); // backward without reason
    const back = await advance(owner2Token, 'informal', 'Documentación incompleta').expect(201);
    expect(back.body.status.state).toBe('informal');
    expect(back.body.transition.reason).toBe('Documentación incompleta');
  });

  it('forbids a non-Owner from advancing the state (403)', async () => {
    await advance(personToken, 'en_proceso').expect(403);
  });

  it('records a transversal audit event per transition', async () => {
    const events = await admin.auditLog.findMany({
      where: { organizationId: ownerOrgId, action: 'organization.formalization_changed' },
    });
    expect(events.length).toBe(4);
  });
});

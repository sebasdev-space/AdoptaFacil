import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * M03 animal behavior disclosure (S-9, FSD v3.5 Doc 4 — "Safe Harbor" del
 * refugio, Art. 2353 inciso 2 C.C.): declare-and-sign atomically, append-only
 * (re-declaring creates a NEW current version, never edits the prior one),
 * role gating (Owner/Administrator/Operator/Veterinarian write,
 * ReadOnlyAuditor view-only), and that the audit trail never leaks the
 * behavioral/medical detail itself.
 */
describe('Animal behavior disclosure (M03, S-9: FSD v3.5 Doc 4)', () => {
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
        organizationName: 'Org',
        displayName: 'Owner',
        email: `s9-${randomUUID()}@test.local`,
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

  const createAnimal = (token: string) =>
    request(server)
      .post('/animals')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Firulais', species: 'dog', sex: 'male', size: 'medium' });

  const disclosurePayload = {
    signedByName: 'Claudia Vásquez',
    reactivityNotes: 'Reactivo con gatos',
    biteHistory: false,
    childrenCompatibility: 'with_supervision',
    medicalConditionsRelevant: 'Alimento senior',
  };

  let owner: Actor;
  let animalId = '';
  let auditor: Actor;
  let auditorAnimalId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    owner = await actorWithRoles(['owner']);
    const animal = await createAnimal(owner.token).expect(201);
    animalId = animal.body.id;

    auditor = await actorWithRoles(['owner']);
    const auditorAnimal = await createAnimal(auditor.token).expect(201);
    auditorAnimalId = auditorAnimal.body.id;
    await admin.userRole.deleteMany({ where: { userId: auditor.userId } });
    await admin.userRole.create({
      data: { organizationId: auditor.orgId, userId: auditor.userId, role: 'read_only_auditor' },
    });
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('no disclosure yet: GET current returns no disclosure', async () => {
    // NestJS sends an empty body (not literal JSON `null`) for a `null`
    // controller return — supertest then defaults `res.body` to `{}`. Assert
    // on the absence of an `id` rather than the exact empty-body shape.
    const res = await request(server)
      .get(`/animals/${animalId}/behavior-disclosures/current`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(res.body.id).toBeUndefined();
  });

  it('Owner declares and signs atomically → hash + declaredAt present, current reflects it', async () => {
    const res = await request(server)
      .post(`/animals/${animalId}/behavior-disclosures`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send(disclosurePayload)
      .expect(201);
    expect(res.body.signedByName).toBe('Claudia Vásquez');
    expect(res.body.childrenCompatibility).toBe('with_supervision');
    expect(res.body.signatureHash).toEqual(expect.any(String));
    expect(res.body.signatureHash.length).toBe(64); // SHA-256 hex
    expect(res.body.declaredAt).toEqual(expect.any(String));

    const current = await request(server)
      .get(`/animals/${animalId}/behavior-disclosures/current`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(current.body.id).toBe(res.body.id);

    // Audit records the action — never the behavioral/medical detail itself.
    const events = await admin.auditLog.findMany({
      where: { organizationId: owner.orgId, action: 'animal.behavior_disclosure_declared' },
    });
    expect(events.length).toBe(1);
    expect(JSON.stringify(events[0].metadata)).not.toContain('gatos');
    expect(JSON.stringify(events[0].metadata)).not.toContain('senior');
  });

  it('re-declaring creates a NEW current version — append-only, never edits the prior one', async () => {
    const first = await request(server)
      .get(`/animals/${animalId}/behavior-disclosures/current`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    const second = await request(server)
      .post(`/animals/${animalId}/behavior-disclosures`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        ...disclosurePayload,
        childrenCompatibility: 'not_recommended',
        biteHistory: true,
        biteHistoryDetail: 'Incidente leve en parque',
      })
      .expect(201);
    expect(second.body.id).not.toBe(first.body.id);
    expect(second.body.childrenCompatibility).toBe('not_recommended');

    const current = await request(server)
      .get(`/animals/${animalId}/behavior-disclosures/current`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(current.body.id).toBe(second.body.id);
    expect(current.body.childrenCompatibility).toBe('not_recommended');
  });

  it('ReadOnlyAuditor can view but not declare (403)', async () => {
    await request(server)
      .get(`/animals/${auditorAnimalId}/behavior-disclosures/current`)
      .set('Authorization', `Bearer ${auditor.token}`)
      .expect(200);

    await request(server)
      .post(`/animals/${auditorAnimalId}/behavior-disclosures`)
      .set('Authorization', `Bearer ${auditor.token}`)
      .send(disclosurePayload)
      .expect(403);
  });

  it('declaring for a non-existent animal 404s', async () => {
    await request(server)
      .post(`/animals/${randomUUID()}/behavior-disclosures`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send(disclosurePayload)
      .expect(404);
  });
});

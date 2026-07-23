import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * M03 clinical record (RF08, T-105): Veterinarian-only create/edit with real
 * versioning (edit → new version, earlier version immutable with its author),
 * attachments + nextDueDate persisted, view roles, and tenant isolation. Every
 * actor operates in their OWN org (each write role can create the animal it then
 * acts on); the auditor's animal is seeded by the superuser client.
 */
describe('Clinical record (M03, RF08: vet-only + versioning + author)', () => {
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
        email: `t105-${randomUUID()}@test.local`,
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

  const createEvent = (token: string, animalId: string, body: Record<string, unknown>) =>
    request(server)
      .post(`/animals/${animalId}/clinical-events`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  let vet: Actor;
  let vetAnimalId = '';
  let eventId = '';

  const vaccine = {
    type: 'vaccine',
    occurredAt: '2026-07-01T00:00:00.000Z',
    nextDueDate: '2027-07-01T00:00:00.000Z',
    details: { vaccine: 'rabia', lote: 'A1' },
    attachments: [{ filename: 'carnet.pdf', contentType: 'application/pdf' }],
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    vet = await actorWithRoles(['veterinarian']);
    const animal = await createAnimal(vet.token).expect(201);
    vetAnimalId = animal.body.id;
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('Veterinarian registers a vaccine with attachment + nextDueDate → version 1, authored', async () => {
    const res = await createEvent(vet.token, vetAnimalId, vaccine).expect(201);
    expect(res.body.version).toBe(1);
    expect(res.body.authorUserId).toBe(vet.userId);
    expect(res.body.nextDueDate).toBe('2027-07-01T00:00:00.000Z');
    expect(res.body.attachments).toHaveLength(1);
    expect(res.body.attachments[0].storageRef).toContain(vet.orgId);
    expect(res.body.eventId).toEqual(expect.any(String));
    eventId = res.body.eventId;

    // Audit records the action + non-sensitive metadata only — never the detail.
    const events = await admin.auditLog.findMany({
      where: { organizationId: vet.orgId, action: 'animal.clinical_event_created' },
    });
    expect(events.length).toBe(1);
    expect(JSON.stringify(events[0].metadata)).not.toContain('rabia');
  });

  it('editing creates version 2 and keeps version 1 immutable with its author', async () => {
    const edit = await request(server)
      .post(`/animals/${vetAnimalId}/clinical-events/${eventId}`)
      .set('Authorization', `Bearer ${vet.token}`)
      .send({ details: { vaccine: 'rabia', refuerzo: true } })
      .expect(201);
    expect(edit.body.version).toBe(2);
    // Attachments carried forward into the new version.
    expect(edit.body.attachments.length).toBeGreaterThanOrEqual(1);

    const history = await request(server)
      .get(`/animals/${vetAnimalId}/clinical-events/${eventId}/history`)
      .set('Authorization', `Bearer ${vet.token}`)
      .expect(200);
    expect(history.body.map((e: { version: number }) => e.version)).toEqual([1, 2]);
    // Version 1 preserved intact with its ORIGINAL author + occurredAt + details.
    expect(history.body[0]).toMatchObject({
      version: 1,
      authorUserId: vet.userId,
      occurredAt: '2026-07-01T00:00:00.000Z',
    });
    expect(history.body[0].details).toEqual({ vaccine: 'rabia', lote: 'A1' });

    // The listing shows only the CURRENT (highest) version.
    const list = await request(server)
      .get(`/animals/${vetAnimalId}/clinical-events`)
      .set('Authorization', `Bearer ${vet.token}`)
      .expect(200);
    const ours = list.body.filter((e: { eventId: string }) => e.eventId === eventId);
    expect(ours).toHaveLength(1);
    expect(ours[0].version).toBe(2);
  });

  it('RBAC: only the Veterinarian can create; Owner/Administrator/Operator/Person cannot (403)', async () => {
    const owner = await registerOrg();
    const ownerAnimal = await createAnimal(owner.token).expect(201);
    await createEvent(owner.token, ownerAnimal.body.id, vaccine).expect(403);

    const administrator = await actorWithRoles(['administrator']);
    const adminAnimal = await createAnimal(administrator.token).expect(201);
    await createEvent(administrator.token, adminAnimal.body.id, vaccine).expect(403);

    const operator = await actorWithRoles(['operator']);
    const opAnimal = await createAnimal(operator.token).expect(201);
    await createEvent(operator.token, opAnimal.body.id, vaccine).expect(403);

    const personRes = await request(server)
      .post('/auth/register/person')
      .send({ displayName: 'P', email: `t105-person-${randomUUID()}@test.local`, password })
      .expect(201);
    createdOrgIds.push(personRes.body.user.organizationId);
    await createEvent(personRes.body.tokens.accessToken, vetAnimalId, vaccine).expect(403);
  });

  it('RBAC: ReadOnlyAuditor may VIEW but not create', async () => {
    const auditor = await actorWithRoles(['read_only_auditor']);
    // The auditor cannot create an animal (view-only), so seed one via superuser.
    const seeded = await admin.animal.create({
      data: { organizationId: auditor.orgId, name: 'Michi', species: 'cat' },
    });
    await request(server)
      .get(`/animals/${seeded.id}/clinical-events`)
      .set('Authorization', `Bearer ${auditor.token}`)
      .expect(200);
    await createEvent(auditor.token, seeded.id, vaccine).expect(403);
  });

  it('does not leak clinical events across tenants (RLS): Org B sees none of Org A', async () => {
    const vetB = await actorWithRoles(['veterinarian']);
    const list = await request(server)
      .get(`/animals/${vetAnimalId}/clinical-events`)
      .set('Authorization', `Bearer ${vetB.token}`)
      .expect(200);
    expect(list.body).toHaveLength(0); // vetB's org has no access to Org A's animal/events
  });
});

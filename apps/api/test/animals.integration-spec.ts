import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * M03 animal record (RF07, T-104): create an expediente with attributes/status/
 * photo, derived age (with/without birth date), custom breeds, soft
 * activate/deactivate (no physical delete), the RBAC matrix (who creates/edits/
 * views), cross-tenant isolation, and append-only audit.
 */
describe('Animal record (M03, RF07: expediente + breeds + soft-disable + RBAC)', () => {
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

  async function registerOrg(name = 'Org'): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: name,
        displayName: 'Owner',
        email: `t104-${randomUUID()}@test.local`,
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

  /** Register an org, then set the user's roles EXACTLY to `roles` (superuser). */
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

  let owner: Actor;
  let orgB: Actor;
  let operator: Actor;
  let vet: Actor;
  let auditor: Actor;
  let volunteer: Actor;
  let person: Actor;

  const createAnimal = (token: string, body: Record<string, unknown>) =>
    request(server).post('/animals').set('Authorization', `Bearer ${token}`).send(body);

  const baseAnimal = { name: 'Firulais', species: 'dog', sex: 'male', size: 'medium' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    owner = await registerOrg('Refugio A');
    orgB = await registerOrg('Refugio B');
    operator = await actorWithRoles(['operator']);
    vet = await actorWithRoles(['veterinarian']);
    auditor = await actorWithRoles(['read_only_auditor']);
    volunteer = await actorWithRoles(['volunteer']);

    const personRes = await request(server)
      .post('/auth/register/person')
      .send({ displayName: 'P', email: `t104-person-${randomUUID()}@test.local`, password })
      .expect(201);
    person = {
      token: personRes.body.tokens.accessToken,
      orgId: personRes.body.user.organizationId,
      userId: personRes.body.user.id,
    };
    createdOrgIds.push(person.orgId);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  // --- Create + age ----------------------------------------------------------

  it('lets an Operator create an expediente with a photo (active, audited, age computed)', async () => {
    const res = await createAnimal(operator.token, {
      ...baseAnimal,
      status: 'available',
      birthDate: '2024-07-23T00:00:00.000Z',
      description: 'Rescatado',
      photos: [{ filename: 'firu.jpg', contentType: 'image/jpeg' }],
    }).expect(201);

    expect(res.body.isActive).toBe(true);
    expect(res.body.status).toBe('available');
    expect(res.body.photos).toHaveLength(1);
    expect(res.body.photoRecords[0].storageRef).toContain(operator.orgId);
    expect(res.body.computedAge).toMatchObject({ approximate: false });
    expect(res.body.computedAge.totalMonths).toBeGreaterThanOrEqual(12);

    const events = await admin.auditLog.findMany({
      where: { organizationId: operator.orgId, action: 'animal.created' },
    });
    expect(events.length).toBe(1);
  });

  it('shows an approximate age when the birth date is unknown, and none when fully unknown', async () => {
    const approx = await createAnimal(operator.token, {
      ...baseAnimal,
      approximateAgeMonths: 8,
    }).expect(201);
    expect(approx.body.computedAge).toMatchObject({ totalMonths: 8, approximate: true });

    const unknown = await createAnimal(operator.token, baseAnimal).expect(201);
    expect(unknown.body.computedAge ?? null).toBeNull();
  });

  // --- Custom breeds ---------------------------------------------------------

  it('creates a tenant-scoped custom breed and assigns it', async () => {
    const breed = await request(server)
      .post('/animals/breeds')
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ species: 'dog', name: 'Criollo' })
      .expect(201);

    const animal = await createAnimal(operator.token, {
      ...baseAnimal,
      breedId: breed.body.id,
    }).expect(201);
    expect(animal.body.breedId).toBe(breed.body.id);
    expect(animal.body.breed).toBe('Criollo');

    // A breed of the wrong species is rejected.
    await createAnimal(operator.token, {
      ...baseAnimal,
      species: 'cat',
      breedId: breed.body.id,
    }).expect(400);
  });

  // --- Soft activate / deactivate --------------------------------------------

  it('deactivates (hides) without deleting, and reactivates (restores)', async () => {
    const created = await createAnimal(operator.token, baseAnimal).expect(201);
    const id = created.body.id;

    await request(server)
      .post(`/animals/${id}/deactivate`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(201);

    const active = await request(server)
      .get('/animals')
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200);
    expect(active.body.some((a: { id: string }) => a.id === id)).toBe(false);

    // Still retrievable directly and via includeInactive (not deleted).
    await request(server)
      .get(`/animals/${id}`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200);
    const all = await request(server)
      .get('/animals?includeInactive=true')
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(200);
    expect(all.body.some((a: { id: string }) => a.id === id)).toBe(true);

    const reactivated = await request(server)
      .post(`/animals/${id}/activate`)
      .set('Authorization', `Bearer ${operator.token}`)
      .expect(201);
    expect(reactivated.body.isActive).toBe(true);

    const events = await admin.auditLog.findMany({
      where: { organizationId: operator.orgId, action: 'animal.deactivated' },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  // --- RBAC matrix -----------------------------------------------------------

  it('create/edit RBAC: Operator ✓, Veterinarian ✓, Volunteer ✗, Person ✗, ReadOnlyAuditor ✗', async () => {
    await createAnimal(vet.token, baseAnimal).expect(201);
    await createAnimal(volunteer.token, baseAnimal).expect(403);
    await createAnimal(person.token, baseAnimal).expect(403);
    await createAnimal(auditor.token, baseAnimal).expect(403);
  });

  it('view RBAC: Owner ✓, ReadOnlyAuditor ✓, Volunteer ✗, Person ✗', async () => {
    await request(server).get('/animals').set('Authorization', `Bearer ${owner.token}`).expect(200);
    await request(server)
      .get('/animals')
      .set('Authorization', `Bearer ${auditor.token}`)
      .expect(200);
    await request(server)
      .get('/animals')
      .set('Authorization', `Bearer ${volunteer.token}`)
      .expect(403);
    await request(server)
      .get('/animals')
      .set('Authorization', `Bearer ${person.token}`)
      .expect(403);
  });

  // --- Cross-tenant isolation ------------------------------------------------

  it('does not leak Org A animals to Org B (RLS): list scoped, direct id → 404', async () => {
    const a = await createAnimal(owner.token, { ...baseAnimal, name: 'SoloA' }).expect(201);

    const list = await request(server)
      .get('/animals')
      .set('Authorization', `Bearer ${orgB.token}`)
      .expect(200);
    expect(
      list.body.every((x: { organizationId: string }) => x.organizationId === orgB.orgId),
    ).toBe(true);

    await request(server)
      .get(`/animals/${a.body.id}`)
      .set('Authorization', `Bearer ${orgB.token}`)
      .expect(404);
  });
});

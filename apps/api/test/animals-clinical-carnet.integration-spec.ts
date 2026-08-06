import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * S2-04B-2 (RF08/RF09): the "carnet de vacunación" read-only view over the
 * Ola 1 clinical model — timeline (current events + author name) and PDF
 * export. Reuses `ClinicalController`'s guards; RBAC/no-leak mirror
 * `clinical.integration-spec.ts`'s existing patterns. Tests titled
 * "no-leak: …" are also picked up by `pnpm test:rls`.
 */
describe('Clinical carnet — timeline + PDF (S2-04B-2)', () => {
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

  async function registerOrg(name = 'Org') {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: name,
        displayName: 'Dra. Ana',
        email: `carnet-${randomUUID()}@test.local`,
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

  const createAnimal = (token: string, name = 'Firulais') =>
    request(server)
      .post('/animals')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, species: 'dog', sex: 'male', size: 'medium' })
      .expect(201);

  const createEvent = (token: string, animalId: string, body: Record<string, unknown>) =>
    request(server)
      .post(`/animals/${animalId}/clinical-events`)
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const binaryParser = (res: any, cb: (err: Error | null, body: Buffer) => void): void => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  };

  let vet: Actor;
  let animalWithEventsId = '';
  let animalWithoutEventsId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    vet = await actorWithRoles(['veterinarian']);
    const withEvents = await createAnimal(vet.token, 'Firulais');
    animalWithEventsId = withEvents.body.id;
    const withoutEvents = await createAnimal(vet.token, 'Luna');
    animalWithoutEventsId = withoutEvents.body.id;

    await createEvent(vet.token, animalWithEventsId, {
      type: 'vaccine',
      occurredAt: '2026-01-01T00:00:00.000Z',
      details: { vaccine: 'rabia' },
    });
    await createEvent(vet.token, animalWithEventsId, {
      type: 'treatment',
      occurredAt: '2026-06-01T00:00:00.000Z',
      details: { motivo: 'chequeo' },
    });
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('returns the timeline most-recent-first, each entry with the author display name', async () => {
    const res = await request(server)
      .get(`/animals/${animalWithEventsId}/clinical-events/carnet`)
      .set('Authorization', `Bearer ${vet.token}`)
      .expect(200);

    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ type: 'treatment', authorName: 'Dra. Ana' });
    expect(res.body[1]).toMatchObject({ type: 'vaccine', authorName: 'Dra. Ana' });
    expect(new Date(res.body[0].occurredAt).getTime()).toBeGreaterThan(
      new Date(res.body[1].occurredAt).getTime(),
    );
  });

  it('shows an empty timeline (200, []) for an animal with no clinical events — not an error', async () => {
    const res = await request(server)
      .get(`/animals/${animalWithoutEventsId}/clinical-events/carnet`)
      .set('Authorization', `Bearer ${vet.token}`)
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('downloads a real, non-trivial PDF with the org and animal names', async () => {
    const res = await request(server)
      .get(`/animals/${animalWithEventsId}/clinical-events/carnet.pdf`)
      .set('Authorization', `Bearer ${vet.token}`)
      .buffer()
      .parse(binaryParser)
      .expect(200);

    expect(res.headers['content-type']).toContain('application/pdf');
    const bytes = res.body as Buffer;
    expect(bytes.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(500); // a real rendered document, not a stub
  });

  it('view RBAC: Owner/Administrator/Operator/Veterinarian/ReadOnlyAuditor ✓, Volunteer/Person ✗', async () => {
    const owner = await registerOrg('Owner org');
    const ownerAnimal = await createAnimal(owner.token);
    await request(server)
      .get(`/animals/${ownerAnimal.body.id}/clinical-events/carnet`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    const auditor = await actorWithRoles(['read_only_auditor']);
    const seeded = await admin.animal.create({
      data: { organizationId: auditor.orgId, name: 'Michi', species: 'cat' },
    });
    await request(server)
      .get(`/animals/${seeded.id}/clinical-events/carnet`)
      .set('Authorization', `Bearer ${auditor.token}`)
      .expect(200);

    const volunteer = await actorWithRoles(['volunteer']);
    await request(server)
      .get(`/animals/${animalWithEventsId}/clinical-events/carnet`)
      .set('Authorization', `Bearer ${volunteer.token}`)
      .expect(403);

    const personRes = await request(server)
      .post('/auth/register/person')
      .send({ displayName: 'P', email: `carnet-person-${randomUUID()}@test.local`, password })
      .expect(201);
    createdOrgIds.push(personRes.body.user.organizationId);
    // TODO(client)-driven default: a Persona/adoptante has no org role, so this
    // is denied until the client decides otherwise (spec §restricciones).
    await request(server)
      .get(`/animals/${animalWithEventsId}/clinical-events/carnet`)
      .set('Authorization', `Bearer ${personRes.body.tokens.accessToken}`)
      .expect(403);
  });

  it('no-leak: a foreign org gets 404 for a carnet request, never revealing the animal exists elsewhere', async () => {
    const otherOrgVet = await actorWithRoles(['veterinarian']);
    await request(server)
      .get(`/animals/${animalWithEventsId}/clinical-events/carnet`)
      .set('Authorization', `Bearer ${otherOrgVet.token}`)
      .expect(404);
    await request(server)
      .get(`/animals/${animalWithEventsId}/clinical-events/carnet.pdf`)
      .set('Authorization', `Bearer ${otherOrgVet.token}`)
      .expect(404);
  });

  it('regression: the existing current-version list endpoint is unaffected by the new carnet routes', async () => {
    const res = await request(server)
      .get(`/animals/${animalWithEventsId}/clinical-events`)
      .set('Authorization', `Bearer ${vet.token}`)
      .expect(200);
    expect(res.body).toHaveLength(2);
  });
});

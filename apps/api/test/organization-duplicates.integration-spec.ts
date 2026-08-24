import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * M01 organization duplicate detection (S-3) — risk-table §16 "Captación
 * ilegal / LA-FT" mitigation; no explicit RF in the base document. Exact NIT
 * is a HARD block (409, never a raw 500); a similar name never blocks — it
 * only warns the submitter and queues an OrganizationDuplicateFlag for
 * PlatformAdmin/PlatformSuperAdmin review, gated deny-by-default, decided
 * exactly once (append-only after that).
 *
 * `/auth/register/organization` is throttled to 10/60s per IP (see
 * `auth.controller.ts`) — this file deliberately keeps its total
 * registrations well under that by REUSING actors across scenarios instead of
 * minting a fresh org per assertion (unlike most other M01 specs, which don't
 * need nearly as many distinct organizations).
 */
describe('Organization duplicate detection (M01, S-3)', () => {
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
        email: `s3-dup-${randomUUID()}@test.local`,
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

  const putProfile = (token: string, body: Record<string, unknown>) =>
    request(server).put('/org/profile').set('Authorization', `Bearer ${token}`).send(body);

  const queue = (token: string) =>
    request(server).get('/platform/duplicates/queue').set('Authorization', `Bearer ${token}`);

  const decide = (token: string, id: string, decision: string) =>
    request(server)
      .post(`/platform/duplicates/${id}/decision`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision });

  let platformAdmin: Actor;
  let person: Actor;
  /** Reused across the NIT tests as the "already holds this NIT" org — a
   *  fresh PUT per scenario, never a fresh registration. */
  let nitHolder: Actor;
  const ANCHOR_NIT = `900${randomUUID().slice(0, 6)}-1`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    nitHolder = await registerOrg('Fundación NIT Ancla');
    await putProfile(nitHolder.token, { nit: ANCHOR_NIT }).expect(200);

    platformAdmin = await actorWithRoles(['owner', 'platform_admin']);

    const personRes = await request(server)
      .post('/auth/register/person')
      .send({ displayName: 'P', email: `s3-dup-person-${randomUUID()}@test.local`, password })
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

  describe('exact NIT — hard block', () => {
    it('blocks with a clear 409 (never a raw 500), audits it, and the write does not apply', async () => {
      const second = await registerOrg('Fundación Candidata NIT');
      const res = await putProfile(second.token, {
        nit: ANCHOR_NIT,
        description: 'intento',
      }).expect(409);
      expect(res.body.message).toBe('Ya existe una organización registrada con este NIT.');

      const read = await request(server)
        .get('/org/profile')
        .set('Authorization', `Bearer ${second.token}`)
        .expect(200);
      expect(read.body.nit ?? null).toBeNull();
      expect(read.body.description ?? null).toBeNull();

      const events = await admin.auditLog.findMany({
        where: { organizationId: second.orgId, action: 'organization.duplicate_check_blocked' },
      });
      expect(events).toHaveLength(1);
      expect(events[0].metadata).toMatchObject({
        matchType: 'exact_nit',
        matchedOrganizationId: nitHolder.orgId,
      });
      // The NIT itself is never logged in clear.
      expect(JSON.stringify(events[0].metadata)).not.toContain(ANCHOR_NIT);
    });

    it('does not block saving the SAME NIT the org already has (no false conflict against itself)', async () => {
      await putProfile(nitHolder.token, { nit: ANCHOR_NIT, description: 'sigo siendo yo' }).expect(
        200,
      );
    });
  });

  describe('similar name — warns + flags, never blocks', () => {
    it('saves successfully, returns duplicateWarning, and queues a pending flag visible to PlatformAdmin', async () => {
      const token = randomUUID().slice(0, 8);
      const existing = await registerOrg(`Refugio Patitas Felices ${token}`);
      const candidate = await registerOrg('Sin nombre aún');

      const res = await putProfile(candidate.token, {
        name: `Refugio Patitas Felises ${token}`,
      }).expect(200);

      expect(res.body.duplicateWarning?.matches).toEqual(
        expect.arrayContaining([expect.objectContaining({ organizationId: existing.orgId })]),
      );

      const flags = await admin.organizationDuplicateFlag.findMany({
        where: { organizationId: candidate.orgId },
      });
      const flag = flags.find((f) => f.matchedOrganizationId === existing.orgId);
      expect(flag).toMatchObject({ matchType: 'similar_name', status: 'pending' });

      // Visible to PlatformAdmin's cross-tenant review queue, with a stable
      // contract shape (id/organizationId/organizationName/
      // matchedOrganizationId/matchedOrganizationName/matchType/
      // similarityScore/status/createdAt; decidedByUserId/decidedAt unset).
      const before = await queue(platformAdmin.token).expect(200);
      const queued = before.body.find((f: { id: string }) => f.id === flag!.id);
      expect(queued).toMatchObject({
        id: flag!.id,
        organizationId: candidate.orgId,
        organizationName: expect.any(String),
        matchedOrganizationId: existing.orgId,
        matchedOrganizationName: expect.any(String),
        matchType: 'similar_name',
        similarityScore: expect.any(Number),
        status: 'pending',
        createdAt: expect.any(String),
      });
      expect(queued.decidedByUserId ?? null).toBeNull();
      expect(queued.decidedAt ?? null).toBeNull();

      // Dismiss it — moves out of the queue and is audited under the FLAGGED org.
      const decided = await decide(platformAdmin.token, flag!.id, 'dismiss').expect(201);
      expect(decided.body).toMatchObject({
        status: 'dismissed',
        decidedByUserId: platformAdmin.userId,
      });

      const after = await queue(platformAdmin.token).expect(200);
      expect(after.body.some((f: { id: string }) => f.id === flag!.id)).toBe(false);

      const events = await admin.auditLog.findMany({
        where: { organizationId: candidate.orgId, action: 'organization.duplicate_flag_dismissed' },
      });
      expect(events).toHaveLength(1);
      expect(events[0].actorUserId).toBe(platformAdmin.userId);

      // A decided flag is immutable — deciding it again fails with 400, never
      // a silent overwrite of a `dismissed` flag into `confirmed`.
      await decide(platformAdmin.token, flag!.id, 'confirm').expect(400);
      const stored = await admin.organizationDuplicateFlag.findUnique({ where: { id: flag!.id } });
      expect(stored?.status).toBe('dismissed');
    });

    it('reusing the nit-anchor org with a completely unrelated name saves with no warning and no new flag', async () => {
      const res = await putProfile(nitHolder.token, {
        name: `Organización Totalmente Distinta ${randomUUID()}`,
      }).expect(200);
      expect(res.body.duplicateWarning).toBeUndefined();
    });
  });

  describe('PlatformAdmin review RBAC', () => {
    it('rejects the queue and a decision from a non-platform role (403)', async () => {
      await queue(person.token).expect(403);
      await decide(person.token, randomUUID(), 'dismiss').expect(403);
    });

    it('rejects an unknown flag id with 404', async () => {
      await decide(platformAdmin.token, randomUUID(), 'dismiss').expect(404);
    });
  });
});

import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * M01 organization documents (RF03, T-103): versioned uploads (history kept),
 * the RBAC matrix (who uploads / views / reviews), the cross-tenant platform
 * review flow with a MANDATORY reason, deny-by-default for org roles, and
 * append-only audit. Tenancy is driven by the JWT `org` claim (middleware);
 * a superuser client seeds precise roles and asserts audit rows.
 */
describe('Organization documents (M01, RF03: versioning + RBAC + platform review)', () => {
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
        email: `t103-${randomUUID()}@test.local`,
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
  let administrator: Actor;
  let auditor: Actor;
  let person: Actor;
  let platformAdmin: Actor;
  let platformSuper: Actor;
  let docId = '';

  const upload = (token: string, type = 'rut') =>
    request(server)
      .post('/org/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({ type, filename: 'doc.pdf', contentType: 'application/pdf' });

  const decide = (token: string, id: string, decision: string, note?: string) =>
    request(server)
      .post(`/platform/documents/${id}/decision`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision, ...(note ? { note } : {}) });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    owner = await registerOrg('Refugio A');
    orgB = await registerOrg('Refugio B');
    administrator = await actorWithRoles(['administrator']);
    auditor = await actorWithRoles(['read_only_auditor']);
    platformAdmin = await actorWithRoles(['owner', 'platform_admin']);
    platformSuper = await actorWithRoles(['owner', 'platform_super_admin']);

    const personRes = await request(server)
      .post('/auth/register/person')
      .send({ displayName: 'P', email: `t103-person-${randomUUID()}@test.local`, password })
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

  // --- Upload + versioning ---------------------------------------------------

  it('lets an Owner upload a document (version 1, status pending)', async () => {
    const res = await upload(owner.token).expect(201);
    expect(res.body.document.version).toBe(1);
    expect(res.body.document.status).toBe('pending');
    expect(res.body.document.organizationId).toBe(owner.orgId);
    expect(res.body.upload.url).toContain(owner.orgId);
    docId = res.body.document.id;
  });

  it('keeps the version history: a new upload of the same type is version 2 (v1 preserved)', async () => {
    const res = await upload(owner.token).expect(201);
    expect(res.body.document.version).toBe(2);

    const list = await request(server)
      .get('/org/documents')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    const ruts = list.body.filter((d: { type: string }) => d.type === 'rut');
    expect(ruts.map((d: { version: number }) => d.version).sort()).toEqual([1, 2]);
  });

  // --- RBAC matrix: who uploads / views / reviews ----------------------------

  it('upload RBAC: Administrator ✓, ReadOnlyAuditor ✗, Person ✗', async () => {
    await upload(administrator.token).expect(201);
    await upload(auditor.token).expect(403);
    await upload(person.token).expect(403);
  });

  it('view RBAC: Owner ✓, ReadOnlyAuditor ✓, Person ✗', async () => {
    await request(server)
      .get('/org/documents')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    await request(server)
      .get('/org/documents')
      .set('Authorization', `Bearer ${auditor.token}`)
      .expect(200);
    await request(server)
      .get('/org/documents')
      .set('Authorization', `Bearer ${person.token}`)
      .expect(403);
  });

  it('exposes a computed verification level (level 0 with the empty TODO(client) catalog)', async () => {
    const res = await request(server)
      .get('/org/documents/verification')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(res.body.level).toBe(0);
  });

  // --- Cross-tenant platform review ------------------------------------------

  it('review RBAC: PlatformAdmin/PlatformSuperAdmin see the queue; org roles get 403 (no lateral leak)', async () => {
    const queue = await request(server)
      .get('/platform/documents/queue')
      .set('Authorization', `Bearer ${platformAdmin.token}`)
      .expect(200);
    expect(queue.body.some((d: { id: string }) => d.id === docId)).toBe(true);

    await request(server)
      .get('/platform/documents/queue')
      .set('Authorization', `Bearer ${platformSuper.token}`)
      .expect(200);

    // An org Owner / Administrator / Person can NEVER reach the cross-tenant path.
    await request(server)
      .get('/platform/documents/queue')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(403);
    await request(server)
      .get('/platform/documents/queue')
      .set('Authorization', `Bearer ${person.token}`)
      .expect(403);
  });

  it('requires a reason (motivo) to observe or reject (400 without it)', async () => {
    await decide(platformAdmin.token, docId, 'observe').expect(400);
    await decide(platformAdmin.token, docId, 'reject').expect(400);
    await decide(platformAdmin.token, docId, 'observe', 'Ilegible').expect(201);
  });

  it('forbids an org role from deciding (403)', async () => {
    const fresh = await upload(owner.token).expect(201);
    await decide(owner.token, fresh.body.document.id, 'approve').expect(403);
  });

  it('approves a document and refuses to re-decide it (immutable after decision)', async () => {
    const fresh = await upload(owner.token).expect(201);
    const id = fresh.body.document.id;
    const approved = await decide(platformAdmin.token, id, 'approve').expect(201);
    expect(approved.body.status).toBe('approved');
    expect(approved.body.reviewedByUserId).toBe(platformAdmin.userId);
    await decide(platformAdmin.token, id, 'reject', 'too late').expect(400);
  });

  it('returns 404 when deciding a non-existent document', async () => {
    await decide(platformAdmin.token, randomUUID(), 'approve').expect(404);
  });

  // --- Cross-tenant isolation + audit ----------------------------------------

  it('does not leak Org A documents to Org B (tenant isolation)', async () => {
    const res = await request(server)
      .get('/org/documents')
      .set('Authorization', `Bearer ${orgB.token}`)
      .expect(200);
    expect(res.body.every((d: { organizationId: string }) => d.organizationId === orgB.orgId)).toBe(
      true,
    );
  });

  it('records append-only audit for upload and for the platform decision (UTC, no content)', async () => {
    const uploaded = await admin.auditLog.findMany({
      where: { organizationId: owner.orgId, action: 'organization.document_uploaded' },
    });
    expect(uploaded.length).toBeGreaterThanOrEqual(1);

    const decided = await admin.auditLog.findMany({
      where: { organizationId: owner.orgId, action: 'organization.document_approved' },
    });
    expect(decided.length).toBeGreaterThanOrEqual(1);
    // Only decision/type/version metadata — never document bytes/content.
    expect(JSON.stringify(uploaded[0].metadata)).not.toContain('doc.pdf');
  });
});

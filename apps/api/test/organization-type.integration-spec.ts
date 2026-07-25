import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * T-030: OrganizationType badge + the platform `showOrganizationType` policy.
 * Verifies the org can set its type, the public projection respects the policy
 * ('formalized_only' default vs 'all'), only PlatformAdmin can change it (RBAC),
 * and the change is audited (UTC). The policy is a GLOBAL singleton, so this
 * spec pins it to the default before and after.
 */
describe('Organization type badge + platform policy (T-030, RF01)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const password = 'password123';

  interface Actor {
    token: string;
    orgId: string;
    userId: string;
    slug: string;
  }

  async function registerOrg(): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: 'Refugio',
        displayName: 'Owner',
        email: `t030-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    createdOrgIds.push(res.body.user.organizationId);
    return {
      token: res.body.tokens.accessToken,
      orgId: res.body.user.organizationId,
      userId: res.body.user.id,
      slug: `refugio-${randomUUID().slice(0, 8)}`,
    };
  }

  /** Register an org, set its type + public slug via the profile endpoint. */
  async function orgWithType(type: string): Promise<Actor> {
    const actor = await registerOrg();
    await request(server)
      .put('/org/profile')
      .set('Authorization', `Bearer ${actor.token}`)
      .send({ organizationType: type, slug: actor.slug })
      .expect(200);
    return actor;
  }

  const publicGet = (slug: string) => request(server).get(`/public/organizations/${slug}`);
  const setPolicy = (token: string, value: string) =>
    request(server).put('/platform/settings').set('Authorization', `Bearer ${token}`).send({
      showOrganizationType: value,
    });

  let owner: Actor;
  let platformAdmin: Actor;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    // Pin the global policy to the default before the run.
    await admin.platformSettings.upsert({
      where: { id: 'global' },
      create: { id: 'global', showOrganizationType: 'formalized_only' },
      update: { showOrganizationType: 'formalized_only' },
    });

    owner = await orgWithType('foundation');

    const pa = await registerOrg();
    await admin.userRole.create({
      data: { organizationId: pa.orgId, userId: pa.userId, role: 'platform_admin' },
    });
    platformAdmin = pa;
  });

  afterAll(async () => {
    await admin.platformSettings.update({
      where: { id: 'global' },
      data: { showOrganizationType: 'formalized_only' },
    });
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('lets an Owner set the organization type and reads it back on the profile', async () => {
    const res = await request(server)
      .get('/org/profile')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(res.body.organizationType).toBe('foundation');
  });

  it('formalized_only (default): hides the type for an informal org, shows it once formalized', async () => {
    // Informal → hidden.
    const informal = await publicGet(owner.slug).expect(200);
    expect(informal.body.organizationType ?? null).toBeNull();

    // Formalize the org → now exposed.
    await admin.organizationProfile.update({
      where: { organizationId: owner.orgId },
      data: { formalizationState: 'formalizada' },
    });
    const formalized = await publicGet(owner.slug).expect(200);
    expect(formalized.body.organizationType).toBe('foundation');
  });

  it("'all' policy: shows the type even for an informal org; policy is read back", async () => {
    await setPolicy(platformAdmin.token, 'all').expect(200);
    const read = await request(server)
      .get('/platform/settings')
      .set('Authorization', `Bearer ${platformAdmin.token}`)
      .expect(200);
    expect(read.body.showOrganizationType).toBe('all');

    const informalOrg = await orgWithType('shelter');
    const res = await publicGet(informalOrg.slug).expect(200);
    expect(res.body.organizationType).toBe('shelter'); // shown despite being informal
  });

  it('RBAC: only a platform role may read/change the policy (org roles → 403)', async () => {
    await setPolicy(owner.token, 'all').expect(403);
    await request(server)
      .get('/platform/settings')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(403);
  });

  it('audits the policy change (UTC), without sensitive data', async () => {
    const events = await admin.auditLog.findMany({
      where: { organizationId: platformAdmin.orgId, action: 'platform.settings_updated' },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(events[0].metadata)).toContain('showOrganizationType');
  });
});

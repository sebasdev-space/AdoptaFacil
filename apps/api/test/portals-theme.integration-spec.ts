import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * M14 portal personalization (T-027): the owner saves brand tokens (validated:
 * format + contrast, tokens only), a non-Owner/Admin cannot edit (deny-by-default,
 * 403), and the public portal read returns only the (public) tokens by slug —
 * never another org's data.
 */
describe('Portal theme (M14: tokens + RBAC + public read)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const password = 'password123';

  let ownerToken = '';
  let personToken = '';
  const slug = `theme-a-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const ownerReg = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: 'Refugio Tema',
        displayName: 'Owner',
        email: `t027-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    ownerToken = ownerReg.body.tokens.accessToken;
    createdOrgIds.push(ownerReg.body.user.organizationId);

    // Give the org a slug so the public theme read can find it.
    await request(server)
      .put('/org/profile')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ slug })
      .expect(200);

    const personReg = await request(server)
      .post('/auth/register/person')
      .send({ displayName: 'Persona', email: `t027-p-${randomUUID()}@test.local`, password })
      .expect(201);
    personToken = personReg.body.tokens.accessToken;
    createdOrgIds.push(personReg.body.user.organizationId);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('returns an empty theme before anything is saved', async () => {
    const res = await request(server)
      .get('/portals/theme')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.tokens).toEqual({});
  });

  it('lets an Owner save a valid theme and persists it', async () => {
    const res = await request(server)
      .put('/portals/theme')
      .set('Authorization', `Bearer ${ownerToken}`)
      // primary/foreground pair meets the AA 4.5:1 contrast minimum (5.07:1).
      .send({
        tokens: { primary: '142 72% 29%', 'primary-foreground': '0 0% 100%', radius: '0.5rem' },
      })
      .expect(200);
    expect(res.body.tokens.primary).toBe('142 72% 29%');

    const read = await request(server)
      .get('/portals/theme')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(read.body.tokens.radius).toBe('0.5rem');
  });

  it('rejects unsafe/invalid tokens with 400 (tokens only, format + contrast)', async () => {
    // Unknown key.
    await request(server)
      .put('/portals/theme')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ tokens: { 'font-sans': 'url(evil)' } })
      .expect(400);
    // Malformed color.
    await request(server)
      .put('/portals/theme')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ tokens: { primary: '#ff0000' } })
      .expect(400);
    // Insufficient contrast between a color and its foreground.
    await request(server)
      .put('/portals/theme')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ tokens: { primary: '142 72% 90%', 'primary-foreground': '0 0% 100%' } })
      .expect(400);
  });

  it('forbids a user without Owner/Administrator from editing (403, deny-by-default)', async () => {
    await request(server)
      .put('/portals/theme')
      .set('Authorization', `Bearer ${personToken}`)
      .send({ tokens: { primary: '24 90% 45%' } })
      .expect(403);
  });

  it('records an audit event on each theme update (keys only, never values)', async () => {
    const orgId = createdOrgIds[0];
    const events = await admin.auditLog.findMany({
      where: { organizationId: orgId, action: 'portal.theme_updated' },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(events[0].metadata)).not.toContain('142 72% 29%');
  });

  describe('public endpoint GET /public/organizations/:slug/theme', () => {
    it('returns the saved tokens for a known slug (no auth)', async () => {
      const res = await request(server).get(`/public/organizations/${slug}/theme`).expect(200);
      expect(res.body.tokens.primary).toBe('142 72% 29%');
    });

    it('returns an empty theme for an unknown slug (no cross-org leak)', async () => {
      const res = await request(server)
        .get(`/public/organizations/does-not-exist-${randomUUID().slice(0, 6)}/theme`)
        .expect(200);
      expect(res.body.tokens).toEqual({});
    });
  });
});

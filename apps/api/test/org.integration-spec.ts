import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * M01 organization profile: CRUD with RBAC, the simulable upload seam, and the
 * public portal endpoint (public fields only, NIT gated on formalization, never
 * private data, never another org's data).
 */
describe('Organization profile (M01: CRUD + RBAC + public endpoint)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const password = 'password123';

  let ownerToken = '';
  let ownerOrgId = '';
  let personToken = '';
  const slugA = `refugio-a-${randomUUID().slice(0, 8)}`;

  async function registerOrg(name: string): Promise<{ token: string; orgId: string }> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: name,
        displayName: 'Owner',
        email: `t101-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    createdOrgIds.push(res.body.user.organizationId);
    return { token: res.body.tokens.accessToken, orgId: res.body.user.organizationId };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const owner = await registerOrg('Refugio A');
    ownerToken = owner.token;
    ownerOrgId = owner.orgId;

    const personReg = await request(server)
      .post('/auth/register/person')
      .send({ displayName: 'Persona', email: `t101-person-${randomUUID()}@test.local`, password })
      .expect(201);
    personToken = personReg.body.tokens.accessToken;
    createdOrgIds.push(personReg.body.user.organizationId);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('returns the own profile with defaults for a fresh org (formalization = informal)', async () => {
    const res = await request(server)
      .get('/org/profile')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.id).toBe(ownerOrgId);
    expect(res.body.name).toBe('Refugio A');
    expect(res.body.formalizationState).toBe('informal');
    expect(res.body.rteVigente).toBe(false);
  });

  it('lets an Owner edit the profile and persists it', async () => {
    const res = await request(server)
      .put('/org/profile')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        nit: '900123456-7',
        legalName: 'Fundación Refugio A',
        description: 'Refugio de perros y gatos',
        logoUrl: 'https://cdn.test/logo.png',
        coverPhotos: ['https://cdn.test/c1.jpg', 'https://cdn.test/c2.jpg'],
        whatsapp: '+573001234567',
        contactEmail: 'contacto@refugioa.test',
        phone: '+576011234567',
        location: { country: 'CO', department: 'Antioquia', city: 'Medellín', address: 'Calle 1' },
        socialLinks: { instagram: 'https://instagram.com/refugioa' },
        slug: slugA,
      })
      .expect(200);
    expect(res.body.nit).toBe('900123456-7');
    expect(res.body.slug).toBe(slugA);
    expect(res.body.location.city).toBe('Medellín');

    const read = await request(server)
      .get('/org/profile')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(read.body.description).toBe('Refugio de perros y gatos');
    expect(read.body.coverPhotos).toHaveLength(2);
    expect(read.body.socialLinks.instagram).toBe('https://instagram.com/refugioa');
  });

  it('forbids a user without Owner/Administrator from editing (403)', async () => {
    await request(server)
      .put('/org/profile')
      .set('Authorization', `Bearer ${personToken}`)
      .send({ description: 'hacked' })
      .expect(403);
  });

  it('rejects unknown/forbidden fields (e.g. formalizationState) with 400', async () => {
    await request(server)
      .put('/org/profile')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ formalizationState: 'esal_rte' })
      .expect(400);
  });

  it('reserves a simulable upload target (Owner only)', async () => {
    const res = await request(server)
      .post('/org/profile/uploads')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ filename: 'logo.png', contentType: 'image/png' })
      .expect(201);
    expect(res.body.url).toContain(ownerOrgId);
    expect(res.body.key).toContain('logo.png');
    await request(server)
      .post('/org/profile/uploads')
      .set('Authorization', `Bearer ${personToken}`)
      .send({ filename: 'x.png' })
      .expect(403);
  });

  it('records an audit event on each profile update', async () => {
    const events = await admin.auditLog.findMany({
      where: { organizationId: ownerOrgId, action: 'organization.profile_updated' },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
    // Only field names are recorded, never values.
    expect(JSON.stringify(events[0].metadata)).not.toContain('900123456-7');
  });

  describe('public endpoint GET /public/organizations/:slug', () => {
    it('returns only public fields; hides NIT while informal; never phone/legalName', async () => {
      const res = await request(server).get(`/public/organizations/${slugA}`).expect(200);
      expect(res.body.name).toBe('Refugio A');
      expect(res.body.slug).toBe(slugA);
      expect(res.body.description).toBe('Refugio de perros y gatos');
      // Informal → NIT hidden; private fields never exposed.
      expect(res.body.nit ?? null).toBeNull();
      expect(res.body).not.toHaveProperty('phone');
      expect(res.body).not.toHaveProperty('legalName');
    });

    it('exposes NIT once the organization is formalized', async () => {
      await admin.organizationProfile.update({
        where: { organizationId: ownerOrgId },
        data: { formalizationState: 'formalizada' },
      });
      const res = await request(server).get(`/public/organizations/${slugA}`).expect(200);
      expect(res.body.nit).toBe('900123456-7');
      expect(res.body).not.toHaveProperty('phone');
    });

    it('returns 404 for an unknown slug (no cross-org leak)', async () => {
      await request(server)
        .get(`/public/organizations/does-not-exist-${randomUUID().slice(0, 6)}`)
        .expect(404);
    });
  });
});

import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * S1-07 GLOBAL public adoption catalog: GET /public/animals (no auth) merges
 * ADOPTABLE animals across every organization that has a public profile
 * (slug set) — the per-org endpoint's cross-tenant SECURITY DEFINER read,
 * fanned out over the org directory (no migration adds a cross-org function).
 * Verifies: multiple orgs appear together, an org WITHOUT a slug never
 * appears, species/city filters, and page-based pagination across the
 * merged set.
 */
describe('Public adoption catalog — GLOBAL (S1-07)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const password = 'password123';

  interface Actor {
    token: string;
    orgId: string;
    slug: string;
  }

  async function registerOrgWithSlug(name: string, city?: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: name,
        displayName: 'Owner',
        email: `t-s107-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    const token = res.body.tokens.accessToken;
    const orgId = res.body.user.organizationId;
    createdOrgIds.push(orgId);
    const slug = `s107-${randomUUID().slice(0, 8)}`;
    await request(server)
      .put('/org/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ slug, ...(city ? { location: { city } } : {}) })
      .expect(200);
    return { token, orgId, slug };
  }

  const createAnimal = (token: string, body: Record<string, unknown>) =>
    request(server).post('/animals').set('Authorization', `Bearer ${token}`).send(body);

  const publicListAll = (query = '') => request(server).get(`/public/animals${query}`);

  let orgA: Actor;
  let orgB: Actor;
  let orgNoSlugId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    orgA = await registerOrgWithSlug('Refugio Global A', 'Bogotá');
    await createAnimal(orgA.token, {
      name: 'PerroA',
      species: 'dog',
      sex: 'male',
      size: 'medium',
    }).expect(201);
    await createAnimal(orgA.token, {
      name: 'GatoA',
      species: 'cat',
      sex: 'female',
      size: 'small',
    }).expect(201);

    orgB = await registerOrgWithSlug('Refugio Global B', 'Medellín');
    await createAnimal(orgB.token, {
      name: 'PerroB',
      species: 'dog',
      sex: 'male',
      size: 'large',
    }).expect(201);
    // Non-adoptable in orgB (adopted) — must never appear globally either.
    await createAnimal(orgB.token, {
      name: 'AdoptadoB',
      species: 'dog',
      sex: 'male',
      size: 'medium',
      status: 'adopted',
    }).expect(201);

    // An org WITHOUT a public slug (no PUT /org/profile with slug) — its
    // animal must NEVER leak into the global catalog.
    const noSlugReg = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: 'Refugio Sin Slug',
        displayName: 'Owner',
        email: `t-s107-noslug-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    orgNoSlugId = noSlugReg.body.user.organizationId;
    createdOrgIds.push(orgNoSlugId);
    await createAnimal(noSlugReg.body.tokens.accessToken, {
      name: 'PerroSinSlug',
      species: 'dog',
      sex: 'male',
      size: 'medium',
    }).expect(201);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('merges adoptable animals from MULTIPLE organizations, with org id/name/slug/city attached', async () => {
    const res = await publicListAll().expect(200);
    const names = res.body.data.map((a: { name: string }) => a.name);
    expect(names).toEqual(expect.arrayContaining(['PerroA', 'GatoA', 'PerroB']));

    const perroA = res.body.data.find((a: { name: string }) => a.name === 'PerroA');
    expect(perroA.organization).toMatchObject({
      id: orgA.orgId,
      name: 'Refugio Global A',
      slug: orgA.slug,
      city: 'Bogotá',
    });

    const perroB = res.body.data.find((a: { name: string }) => a.name === 'PerroB');
    expect(perroB.organization).toMatchObject({
      id: orgB.orgId,
      slug: orgB.slug,
      city: 'Medellín',
    });
  });

  it('never leaks an animal from an organization without a public slug', async () => {
    const res = await publicListAll('?limit=50').expect(200);
    const names = res.body.data.map((a: { name: string }) => a.name);
    expect(names).not.toContain('PerroSinSlug');
    expect(
      res.body.data.every(
        (a: { organization: { id: string } }) => a.organization.id !== orgNoSlugId,
      ),
    ).toBe(true);
  });

  it('excludes non-adoptable animals (adopted) from the global list', async () => {
    const res = await publicListAll('?limit=50').expect(200);
    expect(res.body.data.map((a: { name: string }) => a.name)).not.toContain('AdoptadoB');
  });

  it('filters by species across organizations', async () => {
    const res = await publicListAll('?species=cat&limit=50').expect(200);
    expect(res.body.data.every((a: { species: string }) => a.species === 'cat')).toBe(true);
    expect(res.body.data.map((a: { name: string }) => a.name)).toContain('GatoA');
    expect(res.body.data.map((a: { name: string }) => a.name)).not.toContain('PerroB');
  });

  it('filters by the organization city', async () => {
    // Exact-match assertions here only about OUR fixtures — other seeded/test
    // organizations may share a city in the shared dev DB.
    const res = await publicListAll('?city=Medell%C3%ADn&limit=50').expect(200);
    const names = res.body.data.map((a: { name: string }) => a.name);
    expect(names).toContain('PerroB');
    expect(names).not.toContain('PerroA'); // orgA is in Bogotá
    expect(
      res.body.data.every(
        (a: { organization: { city: string } }) => a.organization.city === 'Medellín',
      ),
    ).toBe(true);
  });

  it('paginates across the merged set (page-based, server-capped at 50)', async () => {
    const first = await publicListAll('?limit=1&page=1').expect(200);
    expect(first.body.data).toHaveLength(1);
    expect(first.body.limit).toBe(1);
    expect(first.body.page).toBe(1);
    expect(first.body.total).toBeGreaterThanOrEqual(3);

    const capped = await publicListAll('?limit=999').expect(200);
    expect(capped.body.limit).toBe(50);
  });

  it('rejects an invalid species filter (400)', async () => {
    await publicListAll('?species=dragon').expect(400);
  });
});

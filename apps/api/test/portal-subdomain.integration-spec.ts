import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * M14 real portal subdomains (F-1): `GET /public/organizations/by-subdomain/:subdomain`
 * resolves a real host subdomain to its organization's slug — the same
 * SECURITY-DEFINER-backed pattern as the slug-keyed public reads, but for the
 * `subdomain` column. The critical property this suite proves is isolation:
 * Org A's subdomain must NEVER resolve to Org B's slug (or vice-versa), and an
 * unconfigured/unknown subdomain must resolve to nothing.
 */
describe('Portal subdomain resolution (M14: public, no auth, no cross-org leak)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const password = 'password123';

  const suffix = randomUUID().slice(0, 8);
  const slugA = `sub-org-a-${suffix}`;
  const slugB = `sub-org-b-${suffix}`;
  const subdomainA = `refugio-a-${suffix}`;
  const subdomainB = `refugio-b-${suffix}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const ownerA = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: 'Refugio Subdominio A',
        displayName: 'Owner A',
        email: `subdomain-a-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    createdOrgIds.push(ownerA.body.user.organizationId);
    await request(server)
      .put('/org/profile')
      .set('Authorization', `Bearer ${ownerA.body.tokens.accessToken}`)
      .send({ slug: slugA, subdomain: subdomainA })
      .expect(200);

    const ownerB = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: 'Refugio Subdominio B',
        displayName: 'Owner B',
        email: `subdomain-b-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    createdOrgIds.push(ownerB.body.user.organizationId);
    await request(server)
      .put('/org/profile')
      .set('Authorization', `Bearer ${ownerB.body.tokens.accessToken}`)
      .send({ slug: slugB, subdomain: subdomainB })
      .expect(200);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it("resolves Org A's real subdomain to Org A's slug (no auth needed)", async () => {
    const res = await request(server)
      .get(`/public/organizations/by-subdomain/${subdomainA}`)
      .expect(200);
    expect(res.body).toEqual({ slug: slugA });
  });

  it("resolves Org B's real subdomain to Org B's slug — never Org A's", async () => {
    const res = await request(server)
      .get(`/public/organizations/by-subdomain/${subdomainB}`)
      .expect(200);
    expect(res.body.slug).toBe(slugB);
    expect(res.body.slug).not.toBe(slugA);
  });

  it('composes with the existing slug-keyed public read without leaking the other org', async () => {
    const bySubdomain = await request(server)
      .get(`/public/organizations/by-subdomain/${subdomainA}`)
      .expect(200);
    const org = await request(server)
      .get(`/public/organizations/${bySubdomain.body.slug}`)
      .expect(200);
    expect(org.body.name).toBe('Refugio Subdominio A');
    expect(org.body.name).not.toBe('Refugio Subdominio B');
  });

  it('returns 404 for a subdomain no organization has configured (no default leak)', async () => {
    await request(server)
      .get(`/public/organizations/by-subdomain/no-existe-${randomUUID().slice(0, 8)}`)
      .expect(404);
  });
});

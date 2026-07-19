import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import { Role } from '@adoptafacil/contracts';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * RBAC over HTTP: an endpoint gated by @Roles returns 200 for a user holding the
 * role and 403 for one who does not, and role assignment is confined to the
 * caller's organization. Boots the whole app; requires live Postgres + Redis.
 */
async function withOrgContext<T>(
  prisma: PrismaClient,
  organizationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`;
    return fn(tx);
  });
}

describe('RBAC endpoints (role gating + tenant-scoped authority)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const appDb = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_APP } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];

  const ownerEmail = `t012-owner-${randomUUID()}@test.local`;
  const personEmail = `t012-person-${randomUUID()}@test.local`;
  const password = 'password123';

  let ownerToken = '';
  let personToken = '';
  let ownerOrgId = '';
  let secondUserId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    await appDb.$connect();

    // Owner org + owner user (via real registration), then grant the Owner role.
    const orgReg = await request(server)
      .post('/auth/register/organization')
      .send({ organizationName: 'Refugio RBAC', displayName: 'Owner', email: ownerEmail, password })
      .expect(201);
    ownerToken = orgReg.body.tokens.accessToken;
    ownerOrgId = orgReg.body.user.organizationId;
    createdOrgIds.push(ownerOrgId);

    // The registrant is granted the Owner role automatically at registration
    // (T-012b), so no manual seeding is needed here.

    // A second user in the SAME org (assignment target), seeded directly.
    const second = await withOrgContext(appDb, ownerOrgId, (tx) =>
      tx.user.create({
        data: {
          organizationId: ownerOrgId,
          accountType: 'person',
          email: `second-${randomUUID()}@test.local`,
          displayName: 'Second',
        },
      }),
    );
    secondUserId = second.id;

    // A person in their OWN org with no roles.
    const personReg = await request(server)
      .post('/auth/register/person')
      .send({ displayName: 'Persona', email: personEmail, password })
      .expect(201);
    personToken = personReg.body.tokens.accessToken;
    createdOrgIds.push(personReg.body.user.organizationId);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await appDb.$disconnect();
    await admin.$disconnect();
    await app?.close();
  });

  it('returns the caller own roles on /rbac/my-roles', async () => {
    const res = await request(server)
      .get('/rbac/my-roles')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body).toEqual([Role.Owner]);
  });

  it('allows a user WITH the required role (200)', async () => {
    await request(server)
      .get('/rbac/roles')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
  });

  it('denies a user WITHOUT the required role (403)', async () => {
    await request(server)
      .get('/rbac/roles')
      .set('Authorization', `Bearer ${personToken}`)
      .expect(403);
  });

  it('rejects an unauthenticated request (401)', async () => {
    await request(server).get('/rbac/roles').expect(401);
  });

  it('lets an Owner assign an organization role to a user of the same org', async () => {
    const res = await request(server)
      .post('/rbac/roles')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: secondUserId, role: Role.Administrator })
      .expect(201);
    expect(res.body.role).toBe(Role.Administrator);
    expect(res.body.organizationId).toBe(ownerOrgId);
  });

  it('rejects assigning a platform role through the org endpoint (400)', async () => {
    await request(server)
      .post('/rbac/roles')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: secondUserId, role: Role.PlatformSuperAdmin })
      .expect(400);
  });

  it('forbids a role-less user from assigning roles (403)', async () => {
    await request(server)
      .post('/rbac/roles')
      .set('Authorization', `Bearer ${personToken}`)
      .send({ userId: secondUserId, role: Role.Operator })
      .expect(403);
  });

  it('returns 404 when assigning to a user outside the caller organization', async () => {
    await request(server)
      .post('/rbac/roles')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: randomUUID(), role: Role.Operator })
      .expect(404);
  });
});

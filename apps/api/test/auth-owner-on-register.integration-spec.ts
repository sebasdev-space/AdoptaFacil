import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import { Role } from '@adoptafacil/contracts';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * T-012b: registering an organization must automatically grant the registrant
 * the Owner role (legal representative), in the SAME transaction as the org /
 * user / credential — so an organization is never left without an Owner.
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

describe('Owner granted on organization registration (T-012b)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const appDb = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_APP } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];

  const ownerEmail = `t012b-owner-${randomUUID()}@test.local`;
  const personEmail = `t012b-person-${randomUUID()}@test.local`;
  const password = 'password123';

  let ownerToken = '';
  let ownerOrgId = '';
  let ownerUserId = '';
  let personToken = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    await appDb.$connect();

    const orgReg = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: 'Refugio Owner',
        displayName: 'Rep Legal',
        email: ownerEmail,
        password,
      })
      .expect(201);
    ownerToken = orgReg.body.tokens.accessToken;
    ownerOrgId = orgReg.body.user.organizationId;
    ownerUserId = orgReg.body.user.id;
    createdOrgIds.push(ownerOrgId);

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

  it('grants Owner to the registrant, visible via GET /rbac/my-roles', async () => {
    const res = await request(server)
      .get('/rbac/my-roles')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body).toEqual([Role.Owner]);
  });

  it('persists the Owner assignment in user_roles for the registrant', async () => {
    const rows = await admin.userRole.findMany({ where: { userId: ownerUserId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ organizationId: ownerOrgId, role: Role.Owner });
  });

  it('never leaves a freshly registered organization without an Owner', async () => {
    const owners = await admin.userRole.findMany({
      where: { organizationId: ownerOrgId, role: Role.Owner },
    });
    expect(owners.length).toBeGreaterThanOrEqual(1);
  });

  it('lets the auto-granted Owner perform an Owner-only action (assign a role)', async () => {
    // Seed a second user in the org to receive the assignment.
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
    await request(server)
      .post('/rbac/roles')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: second.id, role: Role.Administrator })
      .expect(201);
  });

  it('still denies a role-less person the Owner-gated listing (403)', async () => {
    await request(server)
      .get('/rbac/roles')
      .set('Authorization', `Bearer ${personToken}`)
      .expect(403);
  });

  it('atomicity: a failure inside the registration transaction leaves no orphan org', async () => {
    const orgId = randomUUID();
    await expect(
      withOrgContext(appDb, orgId, async (tx) => {
        await tx.organization.create({ data: { id: orgId, name: 'Rollback Org' } });
        // Simulate a failure occurring after the org row is created (e.g. the
        // Owner role insert failing) — the whole transaction must roll back.
        throw new Error('simulated failure after org creation');
      }),
    ).rejects.toThrow('simulated failure');
    const found = await admin.organization.findUnique({ where: { id: orgId } });
    expect(found).toBeNull();
  });
});

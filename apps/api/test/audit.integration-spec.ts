import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@prisma/client';
import { Role } from '@adoptafacil/contracts';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * End-to-end: a real core action (RBAC role assignment) records exactly one
 * append-only audit event with actor, org, action, entity and UTC timestamp,
 * and without any sensitive data in the payload.
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

describe('Audit trail on a real action (role assignment)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const appDb = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_APP } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];

  let ownerToken = '';
  let ownerOrgId = '';
  let ownerUserId = '';
  let secondUserId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    await appDb.$connect();

    const orgReg = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: 'Refugio Audit',
        displayName: 'Owner',
        email: `t013-owner-${randomUUID()}@test.local`,
        password: 'password123',
      })
      .expect(201);
    ownerToken = orgReg.body.tokens.accessToken;
    ownerOrgId = orgReg.body.user.organizationId;
    ownerUserId = orgReg.body.user.id;
    createdOrgIds.push(ownerOrgId);

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
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await appDb.$disconnect();
    await admin.$disconnect();
    await app?.close();
  });

  it('records exactly one correct audit event when a role is assigned', async () => {
    await request(server)
      .post('/rbac/roles')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: secondUserId, role: Role.Operator })
      .expect(201);

    const events = await admin.auditLog.findMany({
      where: { organizationId: ownerOrgId, action: 'role.assigned' },
    });
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.organizationId).toBe(ownerOrgId);
    expect(event.actorUserId).toBe(ownerUserId);
    expect(event.entityType).toBe('user');
    expect(event.entityId).toBe(secondUserId);
    expect(event.metadata).toEqual({ role: Role.Operator });
    // UTC timestamp present.
    expect(event.createdAt).toBeInstanceOf(Date);
  });
});

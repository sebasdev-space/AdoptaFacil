import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { computeBreakdown } from '@adoptafacil/contracts';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * M15b (F-5, RF26) — conciliación básica: recaudado (donaciones `approved`,
 * por su `net`) vs. dispersado (payouts, F-4), por organización y mes
 * calendario. Verifies: full reconciliation (paid == collected → not
 * flagged), a pending/partial case (collected, nothing dispersed yet → not
 * flagged, T+1 simply hasn't run), a failed-dispersal case (flagged), and
 * RBAC (PlatformAdmin/PlatformSuperAdmin only). The business RULES for
 * flagging are already exhaustively unit-tested in `reconciliation.spec.ts`
 * (imported straight from contracts) — this file proves the SQL aggregation
 * feeds real DB data into that same function correctly.
 */
describe('Reconciliation report (M15b, F-5, RF26: recaudado vs. dispersado)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password123';
  const currentPeriod = new Date().toISOString().slice(0, 7); // 'YYYY-MM' UTC

  interface Actor {
    token: string;
    orgId: string;
    userId: string;
  }

  async function registerOrg(tag: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: `Org ${tag}`,
        displayName: 'Owner',
        email: `reconc-${tag}-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    orgIds.push(res.body.user.organizationId);
    return {
      token: res.body.tokens.accessToken,
      orgId: res.body.user.organizationId,
      userId: res.body.user.id,
    };
  }

  async function registerDonor(tag: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/person')
      .send({
        displayName: 'Donante',
        email: `reconc-${tag}-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    orgIds.push(res.body.user.organizationId);
    return {
      token: res.body.tokens.accessToken,
      orgId: res.body.user.organizationId,
      userId: res.body.user.id,
    };
  }

  async function actorWithRoles(tag: string, roles: string[]): Promise<Actor> {
    const actor = await registerOrg(tag);
    await admin.userRole.deleteMany({ where: { userId: actor.userId } });
    for (const role of roles) {
      await admin.userRole.create({
        data: { organizationId: actor.orgId, userId: actor.userId, role },
      });
    }
    return actor;
  }

  const bankAccountPayload = {
    bankCode: '001',
    accountType: 'savings',
    accountNumber: '1234567890',
    accountHolderName: 'Owner',
    accountHolderDocument: '900123456-1',
  };

  async function donateAndApprove(donorToken: string, orgId: string, intendedAmount: number) {
    const donate = await request(server)
      .post('/donations')
      .set('Authorization', `Bearer ${donorToken}`)
      .send({
        organizationId: orgId,
        intendedAmount,
        commissionPayer: 'organization',
        idempotencyKey: `reconc-${randomUUID()}`,
        payer: { fullName: 'Donante' },
      })
      .expect(201);
    await request(server)
      .post('/donations/webhook')
      .set('x-payment-signature', 'fake-sig')
      .send({
        collectionId: donate.body.collectionId,
        status: 'approved',
        eventId: `evt-reconc-${randomUUID()}`,
      })
      .expect(200);
    return computeBreakdown(intendedAmount, 'organization').net;
  }

  async function waitFor<T>(
    fn: () => Promise<T>,
    predicate: (value: T) => boolean,
    timeoutMs = 5000,
    intervalMs = 100,
  ): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const value = await fn();
      if (predicate(value)) return value;
      if (Date.now() > deadline) throw new Error('waitFor: timed out waiting for condition');
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  async function dispatchAndConfirmPayout(
    platformToken: string,
    orgId: string,
    amount: number,
  ): Promise<void> {
    const idempotencyKey = `reconc-payout-${randomUUID()}`;
    await request(server)
      .post('/platform/payouts')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ organizationId: orgId, amount, idempotencyKey })
      .expect(201);
    const settled = await waitFor(
      () =>
        request(server)
          .get(`/platform/payouts/${orgId}`)
          .set('Authorization', `Bearer ${platformToken}`)
          .expect(200)
          .then((r) => r.body),
      (rows) =>
        rows.some(
          (r: { idempotencyKey: string; wompiPayoutId?: string }) =>
            r.idempotencyKey === idempotencyKey && r.wompiPayoutId,
        ),
    );
    const row = settled.find(
      (r: { idempotencyKey: string }) => r.idempotencyKey === idempotencyKey,
    );
    await request(server)
      .post('/payments/payouts/webhook')
      .send({ payoutId: row.wompiPayoutId, status: 'paid', eventId: `evt-${randomUUID()}` })
      .expect(200);
  }

  const getReport = (token: string, organizationId?: string) =>
    request(server)
      .get('/platform/reconciliation')
      .query(organizationId ? { organizationId } : {})
      .set('Authorization', `Bearer ${token}`);

  let donor: Actor;
  let platformAdmin: Actor;
  let orgReconciled: Actor;
  let orgPending: Actor;
  let orgFailed: Actor;
  let reconciledNet = 0;
  let pendingNet = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    donor = await registerDonor('donor');
    platformAdmin = await actorWithRoles('platform-admin', ['platform_admin']);

    orgReconciled = await registerOrg('reconciled');
    await request(server)
      .put('/org/payout-bank-account')
      .set('Authorization', `Bearer ${orgReconciled.token}`)
      .send(bankAccountPayload)
      .expect(200);
    reconciledNet = await donateAndApprove(donor.token, orgReconciled.orgId, 200_000);
    await dispatchAndConfirmPayout(platformAdmin.token, orgReconciled.orgId, reconciledNet);

    orgPending = await registerOrg('pending');
    pendingNet = await donateAndApprove(donor.token, orgPending.orgId, 100_000);
    // No payout requested at all — this org is still waiting for T+1.

    orgFailed = await registerOrg('failed');
    await donateAndApprove(donor.token, orgFailed.orgId, 50_000);
    // Seed a FAILED payout attempt directly (same shortcut as the F-4 test:
    // a real failed dispatch is already covered there; here we only need the
    // reconciliation report to correctly surface an EXISTING failed row).
    await admin.payout.create({
      data: {
        organizationId: orgFailed.orgId,
        amount: 50_000,
        idempotencyKey: `reconc-failed-${randomUUID()}`,
        status: 'failed',
        attempts: 1,
        lastError: 'La organización no tiene una cuenta bancaria registrada.',
      },
    });
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('RBAC: only PlatformAdmin/PlatformSuperAdmin may read the report (Owner → 403)', async () => {
    await getReport(orgReconciled.token).expect(403);
  });

  it('fully reconciled org: collected == dispersedPaid, pending 0, NOT flagged', async () => {
    const res = await getReport(platformAdmin.token, orgReconciled.orgId).expect(200);
    const row = res.body.rows.find((r: { period: string }) => r.period === currentPeriod);
    expect(row).toMatchObject({
      organizationId: orgReconciled.orgId,
      collected: reconciledNet,
      dispersedPaid: reconciledNet,
      pending: 0,
      flagged: false,
    });
    expect(row.flagReason).toBeUndefined();
  });

  it('pending org (collected, nothing dispersed yet): pending == collected, NOT flagged', async () => {
    const res = await getReport(platformAdmin.token, orgPending.orgId).expect(200);
    const row = res.body.rows.find((r: { period: string }) => r.period === currentPeriod);
    expect(row).toMatchObject({
      organizationId: orgPending.orgId,
      collected: pendingNet,
      dispersedPaid: 0,
      pending: pendingNet,
      flagged: false,
    });
  });

  it('org with a failed dispersal attempt: flagged for manual review', async () => {
    const res = await getReport(platformAdmin.token, orgFailed.orgId).expect(200);
    const row = res.body.rows.find((r: { period: string }) => r.period === currentPeriod);
    expect(row.dispersedFailed).toBe(50_000);
    expect(row.flagged).toBe(true);
    expect(row.flagReason).toBe('failed_payout');
  });

  it('without an organizationId filter, the report includes multiple organizations', async () => {
    const res = await getReport(platformAdmin.token).expect(200);
    const orgIdsInReport = new Set(
      res.body.rows.map((r: { organizationId: string }) => r.organizationId),
    );
    expect(orgIdsInReport.has(orgReconciled.orgId)).toBe(true);
    expect(orgIdsInReport.has(orgPending.orgId)).toBe(true);
    expect(orgIdsInReport.has(orgFailed.orgId)).toBe(true);
  });

  it('report carries its own time window and generation timestamp', async () => {
    const res = await getReport(platformAdmin.token, orgReconciled.orgId).expect(200);
    expect(res.body.generatedAt).toEqual(expect.any(String));
    expect(res.body.from).toEqual(expect.any(String));
    expect(res.body.to).toEqual(expect.any(String));
    expect(new Date(res.body.from).getTime()).toBeLessThan(new Date(res.body.to).getTime());
  });
});

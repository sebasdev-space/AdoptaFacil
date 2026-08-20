import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PayoutsService } from '../src/modules/payments/payouts.service';
import { purgeOrganizations } from './support/cleanup';

/**
 * M15b (F-4, RF26) — dispersión T+1 vía Wompi Payouts. Verifies: the org's own
 * bank account registration (RBAC: Owner/Administrator only), triggering a
 * payout (RBAC: PlatformAdmin/PlatformSuperAdmin only, treasury operation),
 * idempotency (a retry with the same key never double-pays), the dispatch
 * failure/retry-signal path when no bank account is registered (same
 * direct-service-call convention as `reminders.integration-spec.ts`), and the
 * webhook settlement (idempotent, PUBLIC, no JWT). `PAYMENT_DRIVER` defaults
 * to 'fake' in tests, so the actual dispatch runs through the deterministic
 * `FakePaymentAdapter` — no network, no real BullMQ backoff needed for the
 * happy path (it resolves near-instantly; we poll briefly for it).
 */
describe('Payouts (M15b, RF26: bank account + dispatch + webhook + no double-pay)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let payoutsService: PayoutsService;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password123';

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
        email: `payouts-${tag}-${randomUUID()}@test.local`,
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
    accountHolderName: 'Refugio Certificable',
    accountHolderDocument: '900123456-1',
  };

  const registerBankAccount = (token: string) =>
    request(server)
      .put('/org/payout-bank-account')
      .set('Authorization', `Bearer ${token}`)
      .send(bankAccountPayload);

  const requestPayout = (token: string, organizationId: string, idempotencyKey: string) =>
    request(server)
      .post('/platform/payouts')
      .set('Authorization', `Bearer ${token}`)
      .send({ organizationId, amount: 200_000, idempotencyKey });

  const listPayouts = (token: string, organizationId: string) =>
    request(server)
      .get(`/platform/payouts/${organizationId}`)
      .set('Authorization', `Bearer ${token}`);

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
      if (Date.now() > deadline) {
        throw new Error('waitFor: timed out waiting for condition');
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  let orgWithBank: Actor;
  let orgWithoutBank: Actor;
  let platformAdmin: Actor;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    payoutsService = app.get(PayoutsService);

    orgWithBank = await registerOrg('with-bank');
    await registerBankAccount(orgWithBank.token).expect(200);

    orgWithoutBank = await registerOrg('no-bank');

    platformAdmin = await actorWithRoles('platform-admin', ['platform_admin']);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('registers the bank account and reads it back (Owner)', async () => {
    const res = await request(server)
      .get('/org/payout-bank-account')
      .set('Authorization', `Bearer ${orgWithBank.token}`)
      .expect(200);
    expect(res.body).toMatchObject({
      organizationId: orgWithBank.orgId,
      bankCode: '001',
      accountType: 'savings',
      accountNumber: '1234567890',
    });
  });

  it('RBAC: only Owner/Administrator may register the bank account (Operator → 403)', async () => {
    const operator = await actorWithRoles('operator-only', ['operator']);
    await registerBankAccount(operator.token).expect(403);
  });

  it('an org with no registered bank account gets 404 reading its own account', async () => {
    await request(server)
      .get('/org/payout-bank-account')
      .set('Authorization', `Bearer ${orgWithoutBank.token}`)
      .expect(404);
  });

  it('RBAC: only PlatformAdmin/PlatformSuperAdmin may trigger a payout (Owner → 403)', async () => {
    await requestPayout(orgWithBank.token, orgWithBank.orgId, `rbac-${randomUUID()}`).expect(403);
  });

  let idempotencyKey = '';
  let firstWompiPayoutId = '';

  it('PlatformAdmin triggers a payout: dispatched via the (fake) PaymentPort, no bank data leaked in the response', async () => {
    idempotencyKey = `payout-${randomUUID()}`;
    const created = await requestPayout(
      platformAdmin.token,
      orgWithBank.orgId,
      idempotencyKey,
    ).expect(201);
    expect(created.body).toMatchObject({
      organizationId: orgWithBank.orgId,
      amount: 200_000,
      idempotencyKey,
      status: 'scheduled',
    });
    expect(created.body).not.toHaveProperty('bankAccount');
    expect(created.body).not.toHaveProperty('accountNumber');

    const dispatched = await waitFor(
      () =>
        listPayouts(platformAdmin.token, orgWithBank.orgId)
          .expect(200)
          .then((r) => r.body),
      (rows) => rows.some((r: { idempotencyKey: string }) => r.idempotencyKey === idempotencyKey),
    );
    const row = dispatched.find(
      (r: { idempotencyKey: string }) => r.idempotencyKey === idempotencyKey,
    );
    const settled = await waitFor(
      () =>
        listPayouts(platformAdmin.token, orgWithBank.orgId)
          .expect(200)
          .then((r) => r.body),
      (rows) =>
        rows.find((r: { id: string }) => r.id === row.id)?.wompiPayoutId !== undefined &&
        rows.find((r: { id: string }) => r.id === row.id)?.wompiPayoutId !== null,
    );
    const finalRow = settled.find((r: { id: string }) => r.id === row.id);
    expect(finalRow.wompiPayoutId).toMatch(/^fake-pay-/);
    firstWompiPayoutId = finalRow.wompiPayoutId;
  });

  it('is idempotent: a retry with the SAME idempotencyKey returns the SAME payout — never double-pays', async () => {
    const retry = await requestPayout(
      platformAdmin.token,
      orgWithBank.orgId,
      idempotencyKey,
    ).expect(201);
    expect(retry.body.wompiPayoutId).toBe(firstWompiPayoutId);

    const rows = await admin.payout.findMany({
      where: { organizationId: orgWithBank.orgId, idempotencyKey },
    });
    expect(rows).toHaveLength(1); // never a second row for the same key
  });

  it('dispatch fails cleanly (and signals a retry) when the org has NO registered bank account', async () => {
    const failingPayout = await admin.payout.create({
      data: {
        organizationId: orgWithoutBank.orgId,
        amount: 50_000,
        idempotencyKey: `no-bank-${randomUUID()}`,
        status: 'scheduled',
      },
    });

    // Same convention as `reminders.integration-spec.ts`: drive the dispatch
    // directly (not through BullMQ's real backoff) to assert the throw +
    // persisted failure state deterministically.
    await expect(payoutsService.dispatch(failingPayout.id, orgWithoutBank.orgId)).rejects.toThrow();

    const after = await admin.payout.findUnique({ where: { id: failingPayout.id } });
    expect(after?.status).toBe('failed');
    expect(after?.attempts).toBe(1);
    expect(after?.lastError).toMatch(/cuenta bancaria/);
    expect(after?.wompiPayoutId).toBeNull(); // never called Wompi
  });

  it('webhook settles the payout to paid (idempotent — a repeated delivery is a no-op)', async () => {
    await request(server)
      .post('/payments/payouts/webhook')
      .send({ payoutId: firstWompiPayoutId, status: 'paid', eventId: `evt-${randomUUID()}` })
      .expect(200);

    const settled = await listPayouts(platformAdmin.token, orgWithBank.orgId).expect(200);
    const row = settled.body.find(
      (r: { idempotencyKey: string }) => r.idempotencyKey === idempotencyKey,
    );
    expect(row.status).toBe('paid');

    // A second delivery (even with a different eventId) is a no-op: the row is
    // already settled, so `apply_payout_webhook` no longer matches 'scheduled'.
    await request(server)
      .post('/payments/payouts/webhook')
      .send({ payoutId: firstWompiPayoutId, status: 'paid', eventId: `evt-${randomUUID()}` })
      .expect(200);
    const stillOne = await admin.payout.findMany({ where: { wompiPayoutId: firstWompiPayoutId } });
    expect(stillOne).toHaveLength(1);
    expect(stillOne[0].status).toBe('paid');
  });

  it('audits the key lifecycle events (UTC), never the raw account number', async () => {
    const events = await admin.auditLog.findMany({
      where: { organizationId: orgWithBank.orgId },
      orderBy: { createdAt: 'asc' },
    });
    const actions = events.map((e) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'payments.bank_account_registered',
        'payments.payout_requested',
        'payments.payout_dispatched',
        'payments.payout_paid',
      ]),
    );
    const bankAccountEvent = events.find((e) => e.action === 'payments.bank_account_registered');
    expect(JSON.stringify(bankAccountEvent?.metadata)).not.toContain('1234567890');
    expect(JSON.stringify(bankAccountEvent?.metadata)).toContain('7890'); // last4 only
  });
});

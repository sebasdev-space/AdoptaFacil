import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DianVerificationService } from '../src/modules/org/dian-verification.service';
import { DIAN_PORT } from '../src/modules/org/dian.port';
import { FakeDianAdapter } from '../src/modules/org/fake-dian.adapter';
import { purgeOrganizations } from './support/cleanup';

/** Polls GET /org/formalization until `dianVerification.status` matches (or
 *  times out) — the auto-triggered verification is a REAL async BullMQ job
 *  (fast by default: FakeDianAdapter's default ~50ms latency, 0 failures), so
 *  a short poll is enough; this is NOT the 4-retry ladder itself (that's
 *  tested by calling DianVerificationService directly, RNF07's own note on
 *  accelerating tests instead of waiting on real hours-long delays). */
async function waitForDianStatus(
  server: ReturnType<INestApplication['getHttpServer']>,
  token: string,
  expected: string,
  timeoutMs = 5000,
) {
  const start = Date.now();
  for (;;) {
    const res = await request(server)
      .get('/org/formalization')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    if (res.body.dianVerification?.status === expected) {
      return res.body;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `Timed out waiting for dianVerification.status="${expected}"; last seen: ${JSON.stringify(res.body.dianVerification)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Generic poll, used where the SPECIFIC worker/adapter that ends up
 *  processing a real (non-direct-call) queued job isn't controllable — e.g.
 *  a manual retry, which legitimately goes through the real shared queue. */
async function pollUntil<T>(
  read: () => Promise<T>,
  isDone: (value: T) => boolean,
  timeoutMs = 5000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await read();
    if (isDone(value)) {
      return value;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error('pollUntil timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * M01 formalization state machine (RF02): valid/invalid transitions, RBAC
 * (Owner only), append-only history, rteVigente coherence, same organization_id.
 * Also covers S-2 (DIAN RTE verification, RNF07): the ESAL → ESAL_RTE gate,
 * its auto-trigger on reaching ESAL, and the manual-retry endpoint.
 */
describe('Formalization state machine (M01, RF02)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const password = 'password123';

  let ownerToken = '';
  let ownerOrgId = '';
  let owner2Token = '';
  let personToken = '';

  async function registerOrg(): Promise<{ token: string; orgId: string }> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: 'Org',
        displayName: 'Owner',
        email: `t102-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    createdOrgIds.push(res.body.user.organizationId);
    return { token: res.body.tokens.accessToken, orgId: res.body.user.organizationId };
  }

  const advance = (token: string, targetState: string, reason?: string) =>
    request(server)
      .post('/org/formalization/transitions')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetState, ...(reason ? { reason } : {}) });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const owner = await registerOrg();
    ownerToken = owner.token;
    ownerOrgId = owner.orgId;
    owner2Token = (await registerOrg()).token;

    const person = await request(server)
      .post('/auth/register/person')
      .send({ displayName: 'P', email: `t102-person-${randomUUID()}@test.local`, password })
      .expect(201);
    personToken = person.body.tokens.accessToken;
    createdOrgIds.push(person.body.user.organizationId);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('starts Informal for a fresh organization', async () => {
    const res = await request(server)
      .get('/org/formalization')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body).toEqual({ state: 'informal', rteVigente: false });
  });

  it('advances the Owner through the full chain, coherent rteVigente at ESAL_RTE — gated by a real (auto-triggered, fake-adapter) DIAN verification', async () => {
    // S-2: reaching ESAL only auto-triggers a verification when the org has a
    // NIT; registration doesn't collect one (by design), so this test sets it
    // directly — proving the REAL gate, not bypassing it.
    await admin.organizationProfile.upsert({
      where: { organizationId: ownerOrgId },
      create: { organizationId: ownerOrgId, nit: '900123456-7' },
      update: { nit: '900123456-7' },
    });

    for (const target of ['en_proceso', 'formalizada', 'esal']) {
      const res = await advance(ownerToken, target).expect(201);
      expect(res.body.status.state).toBe(target);
      expect(res.body.status.rteVigente).toBe(false);
      expect(res.body.transition.organizationId).toBe(ownerOrgId);
      expect(res.body.transition.actorUserId).toEqual(expect.any(String));
    }

    // The auto-triggered verification is a real async BullMQ job (fast by
    // default) — wait for it instead of racing a "still blocked" assertion
    // against its resolution time (a dedicated test below proves the block
    // deterministically, with the adapter forced to fail).
    await waitForDianStatus(server, ownerToken, 'verified');

    const rte = await advance(ownerToken, 'esal_rte').expect(201);
    expect(rte.body.status).toEqual({ state: 'esal_rte', rteVigente: true });
  });

  it('S1-05: a transition persists a recomputed verification level, even at esal_rte with no documents', async () => {
    // No document was ever uploaded/approved for this org — reaching the top
    // of the formalization ladder must NOT be enough on its own (tier 1 still
    // requires an approved rut), proving the writer reads BOTH inputs.
    const profile = await admin.organizationProfile.findUnique({
      where: { organizationId: ownerOrgId },
    });
    expect(profile?.verificationLevel).toMatchObject({ level: 0, blockedBy: ['rut'] });
  });

  it('records an append-only history preserving the same organization_id', async () => {
    const res = await request(server)
      .get('/org/formalization/history')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.length).toBe(4); // informal→en_proceso→formalizada→esal→esal_rte
    expect(res.body.every((t: { organizationId: string }) => t.organizationId === ownerOrgId)).toBe(
      true,
    );
    expect(res.body[0]).toMatchObject({ fromState: 'informal', toState: 'en_proceso' });
    expect(res.body[3]).toMatchObject({ fromState: 'esal', toState: 'esal_rte' });
  });

  it('rejects an invalid transition that skips states (400)', async () => {
    await advance(owner2Token, 'formalizada').expect(400); // from informal, skipping en_proceso
  });

  it('requires a reason to move backward (400 without, 201 with)', async () => {
    await advance(owner2Token, 'en_proceso').expect(201); // informal → en_proceso
    await advance(owner2Token, 'informal').expect(400); // backward without reason
    const back = await advance(owner2Token, 'informal', 'Documentación incompleta').expect(201);
    expect(back.body.status.state).toBe('informal');
    expect(back.body.transition.reason).toBe('Documentación incompleta');
  });

  it('forbids a non-Owner from advancing the state (403)', async () => {
    await advance(personToken, 'en_proceso').expect(403);
  });

  it('records a transversal audit event per transition', async () => {
    const events = await admin.auditLog.findMany({
      where: { organizationId: ownerOrgId, action: 'organization.formalization_changed' },
    });
    expect(events.length).toBe(4);
  });
});

/**
 * S-2 · DIAN RTE verification (RF02 relacionado / RNF07). A SEPARATE app
 * instance overrides DIAN_PORT with an ALWAYS-FAILING fake adapter, so the
 * gate/retry-exhaustion behavior is deterministic instead of depending on the
 * default (always-succeeds) adapter's timing. The 4 staggered retries
 * (5min/30min/2h/24h) are never actually awaited in real time — that would
 * take over 24h — instead, `DianVerificationService.attemptVerification` is
 * called DIRECTLY for attempts 2-5, exactly simulating what the real BullMQ
 * worker would eventually do, per this task's own instruction to accelerate
 * the retry ladder in tests rather than wait on real delays.
 */
describe('DIAN RTE verification — retry ladder + manual retry + RBAC (M01, S-2)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let dianService: DianVerificationService;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const password = 'password123';
  const NIT = '900123456-7';

  async function registerOrgWithNit(): Promise<{ token: string; orgId: string; userId: string }> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: 'Org DIAN',
        displayName: 'Owner',
        email: `s2-dian-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    const orgId = res.body.user.organizationId;
    createdOrgIds.push(orgId);
    await admin.organizationProfile.upsert({
      where: { organizationId: orgId },
      create: { organizationId: orgId, nit: NIT },
      update: { nit: NIT },
    });
    return { token: res.body.tokens.accessToken, orgId, userId: res.body.user.id };
  }

  /**
   * Jumps the org straight to ESAL WITHOUT going through
   * `POST .../transitions` — the full chain (informal → … → esal) is already
   * covered by the OTHER describe block above, using the default (always-
   * succeeds) adapter. Going through the real transition here would enqueue a
   * REAL job on the shared `dian-verification` BullMQ queue (backed by the
   * SAME Redis instance as every other test in this process) — which could be
   * picked up by whichever worker instance is listening, not necessarily
   * THIS app's overridden always-failing one. Every attempt in the tests
   * below is instead driven by calling `DianVerificationService
   * .attemptVerification` DIRECTLY, so the queue is never involved and the
   * behavior is fully deterministic.
   */
  async function jumpToEsal(orgId: string): Promise<void> {
    await admin.organizationProfile.update({
      where: { organizationId: orgId },
      data: { formalizationState: 'esal' },
    });
  }

  const advance = (token: string, targetState: string) =>
    request(server)
      .post('/org/formalization/transitions')
      .set('Authorization', `Bearer ${token}`)
      .send({ targetState });

  const retry = (token: string) =>
    request(server)
      .post('/org/formalization/dian-verification/retry')
      .set('Authorization', `Bearer ${token}`)
      .send();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DIAN_PORT)
      .useValue(new FakeDianAdapter({ latencyMs: 0, failuresBeforeSuccess: 999 }))
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    dianService = app.get(DianVerificationService);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('reaching ESAL auto-triggers a verification; with an always-failing adapter it lands on "retrying" after attempt 1', async () => {
    const owner = await registerOrgWithNit();
    await jumpToEsal(owner.orgId);

    // Simulates what the auto-trigger's queued job would run — called
    // directly (attemptsMade=0) so the app's OWN overridden adapter runs it,
    // never the shared real queue (see jumpToEsal's comment).
    await expect(
      dianService.attemptVerification(
        { organizationId: owner.orgId, nit: NIT, triggeredBy: 'auto', actorUserId: null },
        0,
      ),
    ).rejects.toThrow();

    const status = await request(server)
      .get('/org/formalization')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(status.body.dianVerification).toMatchObject({ status: 'retrying', attemptsCount: 1 });
    expect(status.body.dianVerification.nextRetryAt).toEqual(expect.any(String));

    // The gate blocks ESAL_RTE while retrying, not just while pending.
    await advance(owner.token, 'esal_rte').expect(400);
  });

  it('exhausting all 4 staggered retries lands on "failed" (shown as "Verificación pendiente") — simulated instantly, never waiting real hours', async () => {
    const owner = await registerOrgWithNit();
    await jumpToEsal(owner.orgId);

    // Simulate BullMQ running all 5 attempts (1 initial + 4 staggered
    // retries) instantly, instead of waiting the real 5min/30min/2h/24h the
    // backoff schedule implies. `attemptVerification` always throws on
    // failure (mirroring RemindersService.send(), so BullMQ can retry) —
    // expected and asserted here, not an accident.
    for (const attemptsMade of [0, 1, 2, 3, 4]) {
      await expect(
        dianService.attemptVerification(
          { organizationId: owner.orgId, nit: NIT, triggeredBy: 'auto', actorUserId: null },
          attemptsMade,
        ),
      ).rejects.toThrow();
    }

    const finalStatus = await request(server)
      .get('/org/formalization')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(finalStatus.body.dianVerification).toMatchObject({ status: 'failed', attemptsCount: 5 });

    const attempts = await admin.dianVerificationAttempt.findMany({
      where: { organizationId: owner.orgId },
      orderBy: { attemptNumber: 'asc' },
    });
    expect(attempts).toHaveLength(5);
    expect(attempts.every((a) => a.result === 'failure')).toBe(true);
    expect(attempts.map((a) => a.attemptNumber)).toEqual([1, 2, 3, 4, 5]);

    // Still gated — "failed" is not "verified".
    await advance(owner.token, 'esal_rte').expect(400);

    // Never the NIT, anywhere in the audit trail.
    const events = await admin.auditLog.findMany({
      where: { organizationId: owner.orgId, action: 'organization.dian_verification_attempted' },
    });
    expect(events).toHaveLength(5);
    expect(JSON.stringify(events.map((e) => e.metadata))).not.toContain(NIT);
  });

  it('a manual retry (Owner) re-enqueues a fresh cycle after exhaustion', async () => {
    const owner = await registerOrgWithNit();
    await jumpToEsal(owner.orgId);
    for (const attemptsMade of [0, 1, 2, 3, 4]) {
      await expect(
        dianService.attemptVerification(
          { organizationId: owner.orgId, nit: NIT, triggeredBy: 'auto', actorUserId: null },
          attemptsMade,
        ),
      ).rejects.toThrow();
    }
    const before = await request(server)
      .get('/org/formalization')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(before.body.dianVerification.status).toBe('failed');

    await retry(owner.token).expect(202);

    // The manual retry re-enqueues on the REAL shared queue, which may be
    // picked up by whichever worker instance is listening (this app's
    // always-failing adapter, or another app's default one) — so the
    // resulting status is deliberately NOT asserted here. What IS
    // deterministic regardless of which worker wins: a brand-new cycle
    // (attempt 1) gets recorded for this manual trigger.
    const manualAttempt = await pollUntil(
      () =>
        admin.dianVerificationAttempt.findFirst({
          where: { organizationId: owner.orgId, triggeredBy: 'manual' },
        }),
      (row) => row !== null,
    );
    expect(manualAttempt?.attemptNumber).toBe(1);
  });

  it('rejects a manual retry from a non-Owner/Administrator (403, deny-by-default)', async () => {
    const owner = await registerOrgWithNit();
    await advance(owner.token, 'en_proceso').expect(201);
    await admin.userRole.deleteMany({ where: { userId: owner.userId } });
    await admin.userRole.create({
      data: { organizationId: owner.orgId, userId: owner.userId, role: 'read_only_auditor' },
    });
    await retry(owner.token).expect(403);
  });

  it('rejects a manual retry before the org has reached ESAL (400)', async () => {
    const owner = await registerOrgWithNit();
    await retry(owner.token).expect(400);
  });
});

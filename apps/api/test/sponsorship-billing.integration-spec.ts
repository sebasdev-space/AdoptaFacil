import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SponsorshipBillingService } from '../src/modules/sponsorships/sponsorship-billing.service';
import { SponsorshipPaymentPollerService } from '../src/modules/sponsorships/sponsorship-payment-poller.service';
import { purgeOrganizations } from './support/cleanup';

/**
 * Recurring sponsorship billing end-to-end (S-5-REDISEÑO, M07/RF17, T-057):
 * the daily scan opens periods + walks the tolerant ladder (reminders + up to
 * 3 payment-link attempts) to auto-suspension; a SEPARATE poller confirms
 * payment (never the gateway webhook — see the poller's header comment) and
 * stops the ladder / auto-reactivates a billing-failure suspension. The
 * services are invoked DIRECTLY (same technique as
 * `reminders.integration-spec.ts`'s `RemindersService.generateDue()`) rather
 * than through real BullMQ timers, and dates are advanced by directly
 * backdating `period_started_at` (bypassing the append-only trigger via
 * `session_replication_role = replica`, same technique `cleanup.ts` uses)
 * instead of waiting real days.
 */
describe('Sponsorship recurring billing (S-5-REDISEÑO, M07/RF17, T-057)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password123';
  let billing: SponsorshipBillingService;
  let poller: SponsorshipPaymentPollerService;

  interface Actor {
    token: string;
    orgId: string;
    userId: string;
  }

  async function registerOrg(tag: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: `Refugio ${tag}`,
        displayName: 'Owner',
        email: `s5-o-${tag}-${randomUUID()}@test.local`,
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

  async function registerPerson(tag: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/person')
      .send({
        displayName: `Padrino ${tag}`,
        email: `s5-p-${tag}-${randomUUID()}@test.local`,
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

  /** Creates an animal + plan for `org`, returns the plan id. */
  async function createPlan(org: Actor, amount = 30_000): Promise<string> {
    const animal = await request(server)
      .post('/animals')
      .set('Authorization', `Bearer ${org.token}`)
      .send({
        name: `Firu-${randomUUID().slice(0, 6)}`,
        species: 'dog',
        sex: 'unknown',
        size: 'medium',
      })
      .expect(201);
    const plan = await request(server)
      .post('/sponsorship-plans')
      .set('Authorization', `Bearer ${org.token}`)
      .send({ animalId: animal.body.id, name: 'Padrinazgo', amount, periodicity: 'monthly' })
      .expect(201);
    return plan.body.id;
  }

  async function subscribe(sponsor: Actor, planId: string): Promise<string> {
    const res = await request(server)
      .post('/sponsorships')
      .set('Authorization', `Bearer ${sponsor.token}`)
      .send({ planId })
      .expect(201);
    return res.body.id;
  }

  /** Backdates `period_started_at` on ONE payment period, bypassing the
   *  append-only trigger via `session_replication_role = replica` (same
   *  technique as `cleanup.ts`'s `purgeOrganizations`) — simulates "N days
   *  have already elapsed" without waiting real time. */
  async function backdatePeriodStart(paymentId: string, daysAgo: number): Promise<void> {
    await admin.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await tx.$executeRawUnsafe(
        `UPDATE sponsorship_payments SET period_started_at = now() - ($1::int || ' days')::interval WHERE id = $2::uuid`,
        daysAgo,
        paymentId,
      );
    });
  }

  async function fetchOpenPayment(orgToken: string, sponsorshipId: string) {
    const res = await request(server)
      .get(`/sponsorships/${sponsorshipId}/payments`)
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);
    return res.body;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    billing = app.get(SponsorshipBillingService);
    poller = app.get(SponsorshipPaymentPollerService);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('opens a period with attempt 1 when a sponsorship becomes due, and never duplicates on a re-run', async () => {
    const org = await registerOrg('billing-a');
    const sponsor = await registerPerson('billing-a');
    const planId = await createPlan(org);
    const sponsorshipId = await subscribe(sponsor, planId);

    await billing.runDailyScan();
    const afterFirst = await fetchOpenPayment(org.token, sponsorshipId);
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]).toMatchObject({ sponsorshipId, status: 'pending' });
    expect(afterFirst[0].attempts).toHaveLength(1);
    expect(afterFirst[0].attempts[0]).toMatchObject({ attemptNumber: 1, result: 'pending' });
    const firstCollectionId = afterFirst[0].attempts[0].collectionId;

    // Re-run WITHOUT any elapsed time — must not open a second period or a
    // second attempt 1 (idempotent even before any date manipulation).
    await billing.runDailyScan();
    const afterSecond = await fetchOpenPayment(org.token, sponsorshipId);
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0].attempts).toHaveLength(1);
    expect(afterSecond[0].attempts[0].collectionId).toBe(firstCollectionId);
  });

  it('the full contract shape of SponsorshipPayment/SponsorshipPaymentAttempt is stable', async () => {
    const org = await registerOrg('shape');
    const sponsor = await registerPerson('shape');
    const planId = await createPlan(org);
    const sponsorshipId = await subscribe(sponsor, planId);
    await billing.runDailyScan();

    const [payment] = await fetchOpenPayment(org.token, sponsorshipId);
    expect(payment).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        sponsorshipId,
        organizationId: org.orgId,
        period: expect.stringMatching(/^\d{4}-\d{2}$/),
        status: 'pending',
        attempts: expect.any(Array),
        createdAt: expect.any(String),
      }),
    );
    expect(payment.attempts[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        sponsorshipPaymentId: payment.id,
        attemptNumber: 1,
        collectionId: expect.any(String),
        expiresAt: expect.any(String),
        result: 'pending',
        createdAt: expect.any(String),
      }),
    );
  });

  it('walks the FULL tolerant ladder (2 reminders skipped in assertions, 3 attempts) to auto-suspension after 30 elapsed days, never confirming payment via the poller', async () => {
    const org = await registerOrg('fail');
    const sponsor = await registerPerson('fail');
    const planId = await createPlan(org);
    const sponsorshipId = await subscribe(sponsor, planId);

    await billing.runDailyScan();
    const [opened] = await fetchOpenPayment(org.token, sponsorshipId);
    await backdatePeriodStart(opened.id, 31);

    // One scan run should walk EVERY rung in a single pass (the job "catches
    // up" — never confirmed paid, since the poller is never invoked here).
    await billing.runDailyScan();

    const [final] = await fetchOpenPayment(org.token, sponsorshipId);
    expect(final.status).toBe('failed');
    expect(final.attempts).toHaveLength(3);
    expect(final.attempts[0]).toMatchObject({ attemptNumber: 1, result: 'expired' });
    expect(final.attempts[1]).toMatchObject({ attemptNumber: 2, result: 'expired' });
    expect(final.attempts[2]).toMatchObject({ attemptNumber: 3, result: 'expired' });

    const sponsorship = await request(server)
      .get(`/sponsorships/${sponsorshipId}`)
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    expect(sponsorship.body.status).toBe('suspended');

    const history = await request(server)
      .get(`/sponsorships/${sponsorshipId}/history`)
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    const lastEntry = history.body[history.body.length - 1];
    expect(lastEntry).toMatchObject({
      toStatus: 'suspended',
      reason: 'Pago fallido: se agotaron los 3 intentos de cobro.',
    });
    // A system-triggered transition has no human actor.
    expect(lastEntry.actorUserId).toBeUndefined();

    // Re-running the scan again must NOT touch an already-failed period.
    await billing.runDailyScan();
    const [stillFinal] = await fetchOpenPayment(org.token, sponsorshipId);
    expect(stillFinal.status).toBe('failed');
    expect(stillFinal.attempts).toHaveLength(3);
  });

  it('a confirmed payment (poller) at attempt 2 marks the period paid and stops the ladder — no attempt 3, no suspension', async () => {
    const org = await registerOrg('pay-stops');
    const sponsor = await registerPerson('pay-stops');
    const planId = await createPlan(org);
    const sponsorshipId = await subscribe(sponsor, planId);

    await billing.runDailyScan();
    const [opened] = await fetchOpenPayment(org.token, sponsorshipId);
    await backdatePeriodStart(opened.id, 10); // day 10: expire attempt 1, create attempt 2
    await billing.runDailyScan();

    const [afterAttempt2] = await fetchOpenPayment(org.token, sponsorshipId);
    expect(afterAttempt2.attempts).toHaveLength(2);
    expect(afterAttempt2.status).toBe('pending');

    // FakePaymentAdapter.getCollectionStatus always reports 'approved' — the
    // poller confirms whichever attempt is still `pending` (attempt 2 here).
    await poller.pollPending();

    const [paid] = await fetchOpenPayment(org.token, sponsorshipId);
    expect(paid.status).toBe('paid');
    expect(
      paid.attempts.find((a: { attemptNumber: number }) => a.attemptNumber === 2),
    ).toMatchObject({ result: 'paid' });

    // Backdate far past day 30 and re-scan — a PAID period must never
    // generate attempt 3, a reminder, or a suspension.
    await backdatePeriodStart(paid.id, 31);
    await billing.runDailyScan();
    const [stillPaid] = await fetchOpenPayment(org.token, sponsorshipId);
    expect(stillPaid.status).toBe('paid');
    expect(stillPaid.attempts).toHaveLength(2);

    const sponsorship = await request(server)
      .get(`/sponsorships/${sponsorshipId}`)
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    expect(sponsorship.body.status).toBe('active');
  });

  it('sponsor recovery after auto-suspension: a new self-initiated link, once confirmed, auto-reactivates the sponsorship', async () => {
    const org = await registerOrg('recover');
    const sponsor = await registerPerson('recover');
    const planId = await createPlan(org);
    const sponsorshipId = await subscribe(sponsor, planId);

    await billing.runDailyScan();
    const [opened] = await fetchOpenPayment(org.token, sponsorshipId);
    await backdatePeriodStart(opened.id, 31);
    await billing.runDailyScan(); // exhausts the ladder -> failed + suspended

    const suspended = await request(server)
      .get(`/sponsorships/${sponsorshipId}`)
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    expect(suspended.body.status).toBe('suspended');

    // A stranger (not the sponsor) may not retry this sponsorship.
    const stranger = await registerPerson('recover-stranger');
    await request(server)
      .post(`/sponsorships/${sponsorshipId}/retry-payment`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .expect(404);

    const retried = await request(server)
      .post(`/sponsorships/${sponsorshipId}/retry-payment`)
      .set('Authorization', `Bearer ${sponsor.token}`)
      .expect(200);
    expect(retried.body.attempts).toHaveLength(4);
    expect(retried.body.attempts[3]).toMatchObject({ attemptNumber: 4, result: 'pending' });

    await poller.pollPending();

    const reactivated = await request(server)
      .get(`/sponsorships/${sponsorshipId}`)
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    expect(reactivated.body.status).toBe('active');

    const [finalPayment] = await fetchOpenPayment(org.token, sponsorshipId);
    expect(finalPayment.status).toBe('paid');
  });

  it('a manually-suspended sponsorship (organization-initiated) does NOT auto-reactivate on retry-payment', async () => {
    const org = await registerOrg('manual-susp');
    const sponsor = await registerPerson('manual-susp');
    const planId = await createPlan(org);
    const sponsorshipId = await subscribe(sponsor, planId);

    await request(server)
      .post(`/sponsorships/${sponsorshipId}/suspend`)
      .set('Authorization', `Bearer ${org.token}`)
      .send({ reason: 'Fallecimiento del animal' })
      .expect(200);

    // No FAILED period exists at all for this sponsorship — retry-payment
    // must reject (there is nothing billing-related to recover).
    await request(server)
      .post(`/sponsorships/${sponsorshipId}/retry-payment`)
      .set('Authorization', `Bearer ${sponsor.token}`)
      .expect(404);
  });

  it("no-leak: another organization cannot read or trigger a sponsorship's billing payments", async () => {
    const org = await registerOrg('leak-owner');
    const otherOrg = await registerOrg('leak-other');
    const sponsor = await registerPerson('leak-sponsor');
    const planId = await createPlan(org);
    const sponsorshipId = await subscribe(sponsor, planId);
    await billing.runDailyScan();

    await request(server)
      .get(`/sponsorships/${sponsorshipId}/payments`)
      .set('Authorization', `Bearer ${otherOrg.token}`)
      .expect(404);
  });
});

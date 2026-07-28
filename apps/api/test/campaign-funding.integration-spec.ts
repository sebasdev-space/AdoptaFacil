import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CampaignFundingService } from '../src/modules/campaigns/campaign-funding.service';
import { computeProgress } from '../src/modules/campaigns/campaign-progress';
import { purgeOrganizations } from './support/cleanup';

/**
 * Real campaign funding end-to-end (RF15 · T-055): an APPROVED campaign-attributed
 * donation adds its NET to the campaign's raisedAmount EXACTLY ONCE (idempotent),
 * only when approved, attributed to the right campaign/org, with the public
 * progress reflecting it and the event audited. Exercises BOTH entry points: the
 * per-collection webhook path (CampaignFundingService.applyApprovedCollection — the
 * @fabian handoff) and the authenticated reconcile endpoint.
 */
describe('Campaign funding (RF15 · T-055)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let funding: CampaignFundingService;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password123';

  let tokenA = '';
  let tokenB = '';
  let personToken = '';
  let campaignX = '';
  const goalX = 1_000_000;
  let campaignZ = '';
  let orgB = '';

  async function registerOrg(tag: string): Promise<{ token: string; orgId: string }> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: `Refugio ${tag}`,
        displayName: `Owner ${tag}`,
        email: `t055-${tag}-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    return { token: res.body.tokens.accessToken, orgId: res.body.user.organizationId };
  }

  async function createCampaign(token: string): Promise<string> {
    const res = await request(server)
      .post('/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Cirugía urgente',
        category: 'surgeries',
        goalAmount: goalX,
        deadline: '2026-12-31T00:00:00.000Z',
      })
      .expect(201);
    return res.body.id;
  }

  /** Donate to a campaign; returns { collectionId, net }. Leaves it PENDING. */
  async function donateToCampaign(
    campaignId: string,
    organizationId: string,
  ): Promise<{ collectionId: string; net: number }> {
    const res = await request(server)
      .post('/donations')
      .set('Authorization', `Bearer ${personToken}`)
      .send({
        organizationId,
        intendedAmount: 100_000,
        commissionPayer: 'organization',
        concept: { kind: 'campaign', id: campaignId },
        idempotencyKey: `idem-${randomUUID()}`,
      })
      .expect(201);
    return { collectionId: res.body.collectionId, net: res.body.breakdown.net };
  }

  function webhook(collectionId: string, status: 'approved' | 'declined'): Promise<unknown> {
    return request(server)
      .post('/donations/webhook')
      .set('x-payment-signature', 'test-sig')
      .send({ collectionId, status })
      .expect(200);
  }

  async function raisedOf(campaignId: string): Promise<number> {
    const res = await request(server).get(`/public/campaigns/${campaignId}`).expect(200);
    return res.body.raisedAmount as number;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    funding = app.get(CampaignFundingService);

    const a = await registerOrg('a');
    tokenA = a.token;
    orgIds.push(a.orgId);
    const b = await registerOrg('b');
    tokenB = b.token;
    orgB = b.orgId;
    orgIds.push(b.orgId);

    const person = await request(server)
      .post('/auth/register/person')
      .send({ displayName: 'Donante', email: `t055-p-${randomUUID()}@test.local`, password })
      .expect(201);
    personToken = person.body.tokens.accessToken;
    orgIds.push(person.body.user.organizationId);

    campaignX = await createCampaign(tokenA);
    campaignZ = await createCampaign(tokenB);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('applies an APPROVED campaign donation to raised, exactly once (idempotent)', async () => {
    const { collectionId, net } = await donateToCampaign(campaignX, orgIds[0]);
    // The donations webhook itself applies the funding now (T-057 enganche) —
    // no separate call needed on the happy path.
    await webhook(collectionId, 'approved');
    expect(await raisedOf(campaignX)).toBe(net);

    // A second application of the SAME collection (as a duplicate webhook, a
    // manual retry, or the reconcile endpoint would attempt) is a no-op.
    const again = await funding.applyApprovedCollection(collectionId);
    expect(again).toEqual({ applied: false });
    expect(await raisedOf(campaignX)).toBe(net);
  });

  it('does NOT count a pending or declined donation', async () => {
    const raisedBefore = await raisedOf(campaignX);
    const pending = await donateToCampaign(campaignX, orgIds[0]);

    // Still pending → no-op.
    expect(await funding.applyApprovedCollection(pending.collectionId)).toEqual({ applied: false });
    expect(await raisedOf(campaignX)).toBe(raisedBefore);

    // Declined → still no-op.
    await webhook(pending.collectionId, 'declined');
    expect(await funding.applyApprovedCollection(pending.collectionId)).toEqual({ applied: false });
    expect(await raisedOf(campaignX)).toBe(raisedBefore);
  });

  it('reconcile endpoint catches up a donation approved OUT-OF-BAND (idempotent)', async () => {
    // Since the donations webhook now applies funding itself (T-057 enganche),
    // exercising the reconcile endpoint's OWN catch-up purpose means simulating a
    // donation that became 'approved' WITHOUT going through that webhook path
    // (e.g. legacy data, or an org that missed the enganche) — a direct row
    // update, bypassing the API webhook entirely.
    const raisedBefore = await raisedOf(campaignX);
    const { collectionId, net } = await donateToCampaign(campaignX, orgIds[0]);
    await admin.donation.updateMany({ where: { collectionId }, data: { status: 'approved' } });
    expect(await raisedOf(campaignX)).toBe(raisedBefore); // not yet counted

    const res = await request(server)
      .post('/campaigns/funding/reconcile')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(res.body.applied).toBeGreaterThanOrEqual(1);
    expect(await raisedOf(campaignX)).toBe(raisedBefore + net);

    // Reconcile again → nothing new.
    const again = await request(server)
      .post('/campaigns/funding/reconcile')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(again.body.applied).toBe(0);
    expect(await raisedOf(campaignX)).toBe(raisedBefore + net);
  });

  it('attributes funding only to the target campaign/org (isolation)', async () => {
    const raisedXBefore = await raisedOf(campaignX);
    const { collectionId, net } = await donateToCampaign(campaignZ, orgB);
    // The webhook itself applies the funding (T-057 enganche).
    await webhook(collectionId, 'approved');
    expect(await raisedOf(campaignZ)).toBe(net);
    // X is untouched by Z's funding.
    expect(await raisedOf(campaignX)).toBe(raisedXBefore);

    // A second application of the same collection is a no-op (already counted).
    expect(await funding.applyApprovedCollection(collectionId)).toEqual({ applied: false });

    // Org B reconcile never touches Org A's campaign.
    await request(server)
      .post('/campaigns/funding/reconcile')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(await raisedOf(campaignX)).toBe(raisedXBefore);
  });

  it('audits the funding-applied event (UTC) with no payer data', async () => {
    const rows = await admin.auditLog.findMany({
      where: { action: 'campaign.funding_applied', entityId: campaignX },
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const meta = rows[0].metadata as Record<string, unknown>;
    expect(meta).toHaveProperty('collectionId');
    expect(meta).toHaveProperty('net');
    // Only structural fields — never payer PII.
    expect(Object.keys(meta).sort()).toEqual(['collectionId', 'net']);
  });

  it('public progress reflects the real raised amount (derived, integer COP)', async () => {
    const res = await request(server).get(`/public/campaigns/${campaignX}`).expect(200);
    expect(Number.isInteger(res.body.raisedAmount)).toBe(true);
    expect(res.body.raisedAmount).toBeGreaterThan(0);
    // progress is DERIVED via the single-source helper (never persisted).
    expect(res.body.progress).toBe(computeProgress(res.body.raisedAmount, goalX));
    expect(res.body.progress).toBeGreaterThan(0);
  });
});

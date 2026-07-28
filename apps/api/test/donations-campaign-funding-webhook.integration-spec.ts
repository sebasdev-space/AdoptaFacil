import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CampaignFundingService } from '../src/modules/campaigns/campaign-funding.service';
import { purgeOrganizations } from './support/cleanup';

/**
 * Donations webhook → campaign funding enganche (T-057). When the gateway webhook
 * approves a `concept.kind === 'campaign'` donation, DonationsService calls
 * Sebastián's exported `CampaignFundingService.applyApprovedCollection` (T-055) —
 * ONE line, no campaigns business logic re-implemented here. `CampaignFundingService`
 * is overridden with a jest mock so these assertions are about the ENGANCHE itself
 * (is it called, with what, how many times) — the real idempotent SQL behavior is
 * already covered by Sebastián's `campaign-funding.integration-spec.ts`.
 */
describe('Donations webhook → campaign funding enganche (T-057)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password123';
  const applyApprovedCollection = jest.fn();

  let orgToken = '';
  let orgId = '';
  let personToken = '';
  let campaignId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CampaignFundingService)
      .useValue({ applyApprovedCollection })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const orgReg = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: 'Refugio T057',
        displayName: 'Owner T057',
        email: `t057-org-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    orgToken = orgReg.body.tokens.accessToken;
    orgId = orgReg.body.user.organizationId;
    orgIds.push(orgId);

    const personReg = await request(server)
      .post('/auth/register/person')
      .send({ displayName: 'Donante T057', email: `t057-p-${randomUUID()}@test.local`, password })
      .expect(201);
    personToken = personReg.body.tokens.accessToken;
    orgIds.push(personReg.body.user.organizationId);

    const campaignRes = await request(server)
      .post('/campaigns')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({
        title: 'Campaña T057',
        category: 'surgeries',
        goalAmount: 1_000_000,
        deadline: '2026-12-31T00:00:00.000Z',
      })
      .expect(201);
    campaignId = campaignRes.body.id;
  });

  afterEach(() => {
    applyApprovedCollection.mockClear();
    applyApprovedCollection.mockReset();
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app.close();
  });

  async function donate(concept?: { kind: string; id: string }): Promise<string> {
    const res = await request(server)
      .post('/donations')
      .set('Authorization', `Bearer ${personToken}`)
      .send({
        organizationId: orgId,
        intendedAmount: 30_000,
        commissionPayer: 'organization',
        ...(concept ? { concept } : {}),
        idempotencyKey: `t057-${randomUUID()}`,
      })
      .expect(201);
    return res.body.collectionId as string;
  }

  it('calls applyApprovedCollection(collectionId) ONCE for an approved campaign donation', async () => {
    applyApprovedCollection.mockResolvedValue({ applied: true, campaignId, net: 1000 });
    const collectionId = await donate({ kind: 'campaign', id: campaignId });

    const res = await request(server)
      .post('/donations/webhook')
      .set('x-payment-signature', 'sig')
      .send({ collectionId, status: 'approved', eventId: `evt-${collectionId}` })
      .expect(200);

    expect(res.body.applied).toBe(true);
    expect(res.body.status).toBe('approved');
    expect(applyApprovedCollection).toHaveBeenCalledTimes(1);
    expect(applyApprovedCollection).toHaveBeenCalledWith(collectionId);
  });

  it('does NOT call applyApprovedCollection for an org-concept donation', async () => {
    const collectionId = await donate();

    await request(server)
      .post('/donations/webhook')
      .set('x-payment-signature', 'sig')
      .send({ collectionId, status: 'approved', eventId: `evt-${collectionId}` })
      .expect(200);

    expect(applyApprovedCollection).not.toHaveBeenCalled();
  });

  it('a duplicate webhook delivery does not re-invoke the funding service', async () => {
    applyApprovedCollection.mockResolvedValue({ applied: true, campaignId, net: 1000 });
    const collectionId = await donate({ kind: 'campaign', id: campaignId });

    await request(server)
      .post('/donations/webhook')
      .set('x-payment-signature', 'sig')
      .send({ collectionId, status: 'approved', eventId: `evt-${collectionId}` })
      .expect(200);
    expect(applyApprovedCollection).toHaveBeenCalledTimes(1);

    // Same collection, repeated delivery: the donation is no longer 'pending', so
    // apply_donation_webhook itself no-ops BEFORE the enganche is ever reached.
    const replay = await request(server)
      .post('/donations/webhook')
      .set('x-payment-signature', 'sig')
      .send({ collectionId, status: 'approved', eventId: `evt-${collectionId}` })
      .expect(200);
    expect(replay.body.applied).toBe(false);
    expect(applyApprovedCollection).toHaveBeenCalledTimes(1);
  });

  it('a failure applying campaign funding is audited but does NOT revert the approved donation', async () => {
    applyApprovedCollection.mockRejectedValue(new Error('campaign closed'));
    const collectionId = await donate({ kind: 'campaign', id: campaignId });

    const res = await request(server)
      .post('/donations/webhook')
      .set('x-payment-signature', 'sig')
      .send({ collectionId, status: 'approved', eventId: `evt-${collectionId}` })
      .expect(200);

    // The donation itself is still approved — the campaign-side failure never
    // reverted it nor failed the webhook response.
    expect(res.body.applied).toBe(true);
    expect(res.body.status).toBe('approved');
    expect(applyApprovedCollection).toHaveBeenCalledTimes(1);

    const donationId = res.body.donationId as string;
    const rows = await admin.auditLog.findMany({
      where: { action: 'donation.campaign_funding_failed', entityId: donationId },
    });
    expect(rows).toHaveLength(1);
    const meta = rows[0].metadata as Record<string, unknown>;
    expect(meta).toMatchObject({ collectionId, reason: 'campaign closed' });
  });
});

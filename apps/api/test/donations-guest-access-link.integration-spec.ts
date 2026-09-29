import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { NOTIFICATION_PORT } from '../src/core/notifications/notification.port';
import { purgeOrganizations } from './support/cleanup';

/**
 * Guest donation "magic link" comprobante (client requirement, final): a
 * donor who donated WITHOUT an account must be able to check their donation
 * later without ever registering. Real end-to-end path (real AppModule, real
 * Prisma, real controller/service code — only `NOTIFICATION_PORT` is
 * overridden with a jest spy, same pattern as
 * `donations-campaign-funding-webhook.integration-spec.ts`'s
 * `CampaignFundingService` override, so the emailed link can be inspected):
 *
 *   guest donates (no JWT, real payer.email)
 *     → gateway webhook approves it
 *     → a `DonationAccessLink` row is created + NotificationPort.send is
 *       called with a link containing a token
 *     → GET /public/donations/access/:token returns the donation/receipt.
 */
describe('Donations guest access link (magic link comprobante)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password123';
  const send = jest.fn().mockResolvedValue(undefined);

  let orgId = '';
  let personToken = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(NOTIFICATION_PORT)
      .useValue({ send })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const orgReg = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: 'Refugio Guest Access',
        displayName: 'Owner Guest Access',
        email: `guest-access-org-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    orgId = orgReg.body.user.organizationId;
    orgIds.push(orgId);

    // An authenticated person too, to prove the link is GUEST-only (§ below).
    const personReg = await request(server)
      .post('/auth/register/person')
      .send({
        displayName: 'Persona Con Cuenta',
        email: `guest-access-p-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    personToken = personReg.body.tokens.accessToken;
    orgIds.push(personReg.body.user.organizationId);
    await admin.user.update({
      where: { id: personReg.body.user.id },
      data: { phone: '3000000000', documentId: '1000000001', address: 'Calle 1 # 2-3, Bogotá' },
    });
  });

  afterEach(() => {
    send.mockClear();
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app.close();
  });

  it('emails a working magic link when a GUEST donation is approved, and it resolves via the public endpoint', async () => {
    const guestEmail = `guest-donor-${randomUUID()}@test.local`;
    const idempotencyKey = `guest-access-${randomUUID()}`;

    // 1. Guest donates — no Authorization header at all.
    const donateRes = await request(server)
      .post('/donations')
      .send({
        organizationId: orgId,
        intendedAmount: 40_000,
        commissionPayer: 'organization',
        idempotencyKey,
        payer: { fullName: 'Donante Invitado', email: guestEmail },
      })
      .expect(201);
    expect(donateRes.body.donorUserId).toBeNull();
    const donationId = donateRes.body.id as string;
    const collectionId = donateRes.body.collectionId as string;

    // 2. Gateway webhook approves it.
    const webhookRes = await request(server)
      .post('/donations/webhook')
      .set('x-signature', 'fake-sig')
      .send({ collectionId, status: 'approved', eventId: `evt-${collectionId}` })
      .expect(200);
    expect(webhookRes.body.applied).toBe(true);
    expect(webhookRes.body.status).toBe('approved');

    // 3. A receipt was issued (existing behavior) AND a DonationAccessLink row exists.
    const receipts = await admin.donationReceipt.findMany({ where: { donationId } });
    expect(receipts).toHaveLength(1);
    const accessLinks = await admin.donationAccessLink.findMany({ where: { donationId } });
    expect(accessLinks).toHaveLength(1);
    expect(accessLinks[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);

    // 4. The notification port was called with a link carrying a real token.
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0][0] as { to: string; body: string };
    expect(message.to).toBe(guestEmail);
    const match = message.body.match(/\/donaciones\/comprobante\?token=([^\s]+)/);
    expect(match).toBeTruthy();
    const token = decodeURIComponent(match![1]);
    expect(token.length).toBeGreaterThan(20);

    // 5. GET /public/donations/access/:token (no auth) returns the donation + receipt.
    const accessRes = await request(server)
      .get(`/public/donations/access/${encodeURIComponent(token)}`)
      .expect(200);
    expect(accessRes.body.donation.id).toBe(donationId);
    expect(accessRes.body.donation.status).toBe('approved');
    expect(accessRes.body.donation.amountCharged).toBe(40_000);
    expect(accessRes.body.donation.organizationName).toBe('Refugio Guest Access');
    expect(accessRes.body.receipt).toBeTruthy();
    expect(accessRes.body.receipt.intendedAmount).toBe(40_000);
  });

  it('does NOT create an access link (or send an email) for an AUTHENTICATED donor', async () => {
    const idempotencyKey = `auth-donor-${randomUUID()}`;
    const donateRes = await request(server)
      .post('/donations')
      .set('Authorization', `Bearer ${personToken}`)
      .send({
        organizationId: orgId,
        intendedAmount: 15_000,
        commissionPayer: 'organization',
        idempotencyKey,
      })
      .expect(201);
    const donationId = donateRes.body.id as string;
    const collectionId = donateRes.body.collectionId as string;
    expect(donateRes.body.donorUserId).not.toBeNull();

    await request(server)
      .post('/donations/webhook')
      .set('x-signature', 'fake-sig')
      .send({ collectionId, status: 'approved', eventId: `evt-${collectionId}` })
      .expect(200);

    const accessLinks = await admin.donationAccessLink.findMany({ where: { donationId } });
    expect(accessLinks).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('returns a generic 404 for an unknown token, and the SAME 404 for an expired one', async () => {
    await request(server).get('/public/donations/access/totally-unknown-garbage-token').expect(404);

    // Force-expire a real link and confirm it now 404s the same way.
    const guestEmail = `guest-expired-${randomUUID()}@test.local`;
    const donateRes = await request(server)
      .post('/donations')
      .send({
        organizationId: orgId,
        intendedAmount: 20_000,
        commissionPayer: 'organization',
        idempotencyKey: `guest-expired-${randomUUID()}`,
        payer: { fullName: 'Invitado Expira', email: guestEmail },
      })
      .expect(201);
    const collectionId = donateRes.body.collectionId as string;
    await request(server)
      .post('/donations/webhook')
      .set('x-signature', 'fake-sig')
      .send({ collectionId, status: 'approved', eventId: `evt-${collectionId}` })
      .expect(200);

    const message = send.mock.calls[send.mock.calls.length - 1][0] as { body: string };
    const match = message.body.match(/\/donaciones\/comprobante\?token=([^\s]+)/);
    const token = decodeURIComponent(match![1]);

    await admin.donationAccessLink.updateMany({
      where: { donationId: donateRes.body.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await request(server)
      .get(`/public/donations/access/${encodeURIComponent(token)}`)
      .expect(404);
  });
});

import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { computeBreakdown } from '@adoptafacil/contracts';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * M05 donations (T-050, P1) end-to-end: an authenticated PERSON donates to an
 * organization, the breakdown is the single source (computeBreakdown), the collection
 * runs through the PaymentPort (fake), and on the gateway webhook the donation is
 * approved and an automatic receipt is emitted — idempotent by idempotencyKey (no
 * double donation) and by webhook dedupKey (no second receipt). Every invariant
 * holds: role gating (received list = org roles), cross-tenant isolation, and the
 * donor sees only THEIR OWN receipt.
 */
describe('Donations (M05: donate + breakdown + receipt)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password123';

  let orgToken = '';
  let orgId = '';
  let otherToken = '';
  let personToken = '';
  let person2Token = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const orgReg = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: 'Refugio Beneficiario',
        displayName: 'Owner Refugio',
        email: `t050-org-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    orgToken = orgReg.body.tokens.accessToken;
    orgId = orgReg.body.user.organizationId;
    orgIds.push(orgId);

    const otherReg = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: 'Otra Org',
        displayName: 'Owner Otra',
        email: `t050-other-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    otherToken = otherReg.body.tokens.accessToken;
    orgIds.push(otherReg.body.user.organizationId);

    const personReg = await request(server)
      .post('/auth/register/person')
      .send({
        displayName: 'Persona Donante',
        email: `t050-p1-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    personToken = personReg.body.tokens.accessToken;
    orgIds.push(personReg.body.user.organizationId);

    const person2Reg = await request(server)
      .post('/auth/register/person')
      .send({
        displayName: 'Otra Persona',
        email: `t050-p2-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    person2Token = person2Reg.body.tokens.accessToken;
    orgIds.push(person2Reg.body.user.organizationId);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app.close();
  });

  const orgKey = `org-mode-${randomUUID()}`;
  let orgDonationId = '';
  let orgCollectionId = '';

  it('lets a person donate; org mode ⇒ amountCharged = intendedAmount (breakdown = computeBreakdown)', async () => {
    const res = await request(server)
      .post('/donations')
      .set('Authorization', `Bearer ${personToken}`)
      .send({
        organizationId: orgId,
        intendedAmount: 50000,
        commissionPayer: 'organization',
        idempotencyKey: orgKey,
      })
      .expect(201);

    expect(res.body.status).toBe('pending');
    expect(res.body.organizationId).toBe(orgId);
    const expected = computeBreakdown(50000, 'organization');
    expect(res.body.amountCharged).toBe(50000);
    expect(res.body.breakdown).toEqual(expected);
    // Org absorbs the commissions: the net it receives is below the intended amount.
    expect(res.body.breakdown.net).toBeLessThan(50000);
    orgDonationId = res.body.id;
    orgCollectionId = res.body.collectionId;
  });

  it('is idempotent by idempotencyKey: a retry returns the SAME donation (no double charge)', async () => {
    const res = await request(server)
      .post('/donations')
      .set('Authorization', `Bearer ${personToken}`)
      .send({
        organizationId: orgId,
        intendedAmount: 50000,
        commissionPayer: 'organization',
        idempotencyKey: orgKey,
      })
      .expect(201);
    expect(res.body.id).toBe(orgDonationId);
  });

  it('donor mode ("cubro la comisión") ⇒ amountCharged > intended and net ≈ intended', async () => {
    const res = await request(server)
      .post('/donations')
      .set('Authorization', `Bearer ${personToken}`)
      .send({
        organizationId: orgId,
        intendedAmount: 50000,
        commissionPayer: 'donor',
        idempotencyKey: `donor-mode-${randomUUID()}`,
      })
      .expect(201);
    expect(res.body.amountCharged).toBeGreaterThan(50000);
    expect(res.body.breakdown).toEqual(computeBreakdown(50000, 'donor'));
    // The org receives (net) essentially the intended amount (rounding ≤ 2 pesos).
    expect(Math.abs(res.body.breakdown.net - 50000)).toBeLessThanOrEqual(2);
  });

  it('rejects a below-minimum amount (400) and denies received-list to a non-org role (403)', async () => {
    await request(server)
      .post('/donations')
      .set('Authorization', `Bearer ${personToken}`)
      .send({
        organizationId: orgId,
        intendedAmount: 10,
        commissionPayer: 'organization',
        idempotencyKey: `too-small-${randomUUID()}`,
      })
      .expect(400);

    await request(server)
      .get('/donations/received')
      .set('Authorization', `Bearer ${personToken}`)
      .expect(403);
  });

  it('approves via the gateway webhook and emits an automatic receipt', async () => {
    const res = await request(server)
      .post('/donations/webhook')
      .set('x-payment-signature', 'fake-sig')
      .send({ collectionId: orgCollectionId, status: 'approved', eventId: 'evt-org-1' })
      .expect(200);
    expect(res.body.applied).toBe(true);
    expect(res.body.status).toBe('approved');

    const received = await request(server)
      .get('/donations/received')
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);
    const donation = received.body.find((d: { id: string }) => d.id === orgDonationId);
    expect(donation.status).toBe('approved');
    expect(donation.receipt).toBeTruthy();
    expect(donation.receipt.intendedAmount).toBe(50000);
  });

  it('is idempotent by dedupKey: a repeated webhook does NOT emit a second receipt', async () => {
    const res = await request(server)
      .post('/donations/webhook')
      .set('x-payment-signature', 'fake-sig')
      .send({ collectionId: orgCollectionId, status: 'approved', eventId: 'evt-org-1' })
      .expect(200);
    // Already settled ⇒ no-op.
    expect(res.body.applied).toBe(false);

    // Exactly one receipt row exists for the donation (unique dedup_key guard).
    const receipts = await admin.donationReceipt.findMany({ where: { donationId: orgDonationId } });
    expect(receipts).toHaveLength(1);
  });

  it('isolates donations across orgs: another org never sees this org’s donations', async () => {
    const mine = await request(server)
      .get('/donations/received')
      .set('Authorization', `Bearer ${orgToken}`)
      .expect(200);
    expect(mine.body.some((d: { id: string }) => d.id === orgDonationId)).toBe(true);

    const other = await request(server)
      .get('/donations/received')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    expect(other.body.some((d: { id: string }) => d.id === orgDonationId)).toBe(false);
  });

  it('lets the donor see their own donations and receipt, but not another donor’s', async () => {
    const mine = await request(server)
      .get('/donations/mine')
      .set('Authorization', `Bearer ${personToken}`)
      .expect(200);
    expect(mine.body.some((d: { id: string }) => d.id === orgDonationId)).toBe(true);

    const receipt = await request(server)
      .get(`/donations/${orgDonationId}/receipt`)
      .set('Authorization', `Bearer ${personToken}`)
      .expect(200);
    expect(receipt.body.intendedAmount).toBe(50000);

    // A different person cannot fetch this donation's receipt (identity guard).
    await request(server)
      .get(`/donations/${orgDonationId}/receipt`)
      .set('Authorization', `Bearer ${person2Token}`)
      .expect(404);
  });
});

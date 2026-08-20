import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * M05 donation certificates (F-3, RF14): the certificate is issued
 * automatically inside the webhook approval — ONLY when the beneficiary
 * organization is an ESAL with RTE vigente at that moment. Not eligible ⇒
 * simply no certificate exists (never a "certificado inválido"). The donor
 * sees only THEIR OWN certificate (cross-tenant by identity), and anyone can
 * verify it publicly by its unique code — never by internal ids.
 */
describe('Donation certificates (M05: RF14, ESAL-RTE gating, no cross-org/donor leak)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password123';

  let esalToken = '';
  let esalOrgId = '';
  let informalToken = '';
  let informalOrgId = '';
  let donorToken = '';
  let otherDonorToken = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const esalReg = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: 'Refugio Certificable',
        displayName: 'Owner ESAL',
        email: `certs-esal-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    esalToken = esalReg.body.tokens.accessToken;
    esalOrgId = esalReg.body.user.organizationId;
    orgIds.push(esalOrgId);

    // Force ESAL + RTE vigente (mismo atajo que organization-type.integration-spec.ts:
    // el flujo real de formalización no es lo que esta prueba ejercita).
    await request(server)
      .put('/org/profile')
      .set('Authorization', `Bearer ${esalToken}`)
      .send({ nit: '900123456-1' })
      .expect(200);
    await admin.organizationProfile.update({
      where: { organizationId: esalOrgId },
      data: { formalizationState: 'esal_rte', rteVigente: true },
    });

    const informalReg = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: 'Refugio Informal',
        displayName: 'Owner Informal',
        email: `certs-informal-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    informalToken = informalReg.body.tokens.accessToken;
    informalOrgId = informalReg.body.user.organizationId;
    orgIds.push(informalOrgId);
    // Se queda 'informal' (default) a propósito — nunca debe emitir certificado.

    const donorReg = await request(server)
      .post('/auth/register/person')
      .send({
        displayName: 'María Restrepo',
        email: `certs-donor-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    donorToken = donorReg.body.tokens.accessToken;
    orgIds.push(donorReg.body.user.organizationId);

    const otherDonorReg = await request(server)
      .post('/auth/register/person')
      .send({
        displayName: 'Otro Donante',
        email: `certs-other-donor-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    otherDonorToken = otherDonorReg.body.tokens.accessToken;
    orgIds.push(otherDonorReg.body.user.organizationId);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app.close();
  });

  let esalDonationId = '';
  let esalCollectionId = '';
  let certificateCode = '';

  it('donates to the ESAL-RTE org and approves via webhook', async () => {
    const donate = await request(server)
      .post('/donations')
      .set('Authorization', `Bearer ${donorToken}`)
      .send({
        organizationId: esalOrgId,
        intendedAmount: 150000,
        commissionPayer: 'organization',
        idempotencyKey: `cert-esal-${randomUUID()}`,
        payer: { fullName: 'María Restrepo' },
      })
      .expect(201);
    esalDonationId = donate.body.id;
    esalCollectionId = donate.body.collectionId;

    await request(server)
      .post('/donations/webhook')
      .set('x-payment-signature', 'fake-sig')
      .send({
        collectionId: esalCollectionId,
        status: 'approved',
        eventId: `evt-cert-${randomUUID()}`,
      })
      .expect(200);
  });

  it('issues a real certificate automatically: correct code format, org and donor data', async () => {
    const res = await request(server)
      .get(`/donations/${esalDonationId}/certificate`)
      .set('Authorization', `Bearer ${donorToken}`)
      .expect(200);

    expect(res.body.code).toMatch(/^ADF-CERT-\d{4}-\d{6}$/);
    expect(res.body.organizationName).toBe('Refugio Certificable');
    expect(res.body.organizationNit).toBe('900123456-1');
    expect(res.body.donorName).toBe('María Restrepo');
    expect(res.body.amount).toBe(150000);
    expect(res.body.currency).toBe('COP');
    expect(res.body.contentHash).toMatch(/^[0-9a-f]{64}$/);
    certificateCode = res.body.code;
  });

  it('is idempotent: a repeated webhook delivery never issues a second certificate', async () => {
    await request(server)
      .post('/donations/webhook')
      .set('x-payment-signature', 'fake-sig')
      .send({
        collectionId: esalCollectionId,
        status: 'approved',
        eventId: `evt-cert-repeat-${randomUUID()}`,
      })
      .expect(200);

    const rows = await admin.donationCertificate.findMany({
      where: { donationId: esalDonationId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe(certificateCode);
  });

  it('a DIFFERENT donor cannot fetch this certificate (identity guard, 404)', async () => {
    await request(server)
      .get(`/donations/${esalDonationId}/certificate`)
      .set('Authorization', `Bearer ${otherDonorToken}`)
      .expect(404);
  });

  it('verifies the certificate publicly by code — no session needed', async () => {
    const res = await request(server)
      .get(`/public/donations/certificates/${certificateCode}`)
      .expect(200);
    expect(res.body.organizationName).toBe('Refugio Certificable');
    expect(res.body.organizationNit).toBe('900123456-1');
    expect(res.body.donorName).toBe('María Restrepo');
    expect(res.body.amount).toBe(150000);
    // Superficie mínima: nunca ids internos en la verificación pública.
    expect(res.body.id).toBeUndefined();
    expect(res.body.organizationId).toBeUndefined();
    expect(res.body.donationId).toBeUndefined();
  });

  it('returns 404 for a code that does not exist (no default/fabricated leak)', async () => {
    await request(server)
      .get(`/public/donations/certificates/ADF-CERT-2026-${randomUUID().slice(0, 6)}`)
      .expect(404);
  });

  it('NEVER issues a certificate for a donation to a non-ESAL-RTE organization', async () => {
    const donate = await request(server)
      .post('/donations')
      .set('Authorization', `Bearer ${donorToken}`)
      .send({
        organizationId: informalOrgId,
        intendedAmount: 30000,
        commissionPayer: 'organization',
        idempotencyKey: `cert-informal-${randomUUID()}`,
        payer: { fullName: 'María Restrepo' },
      })
      .expect(201);

    await request(server)
      .post('/donations/webhook')
      .set('x-payment-signature', 'fake-sig')
      .send({
        collectionId: donate.body.collectionId,
        status: 'approved',
        eventId: `evt-informal-${randomUUID()}`,
      })
      .expect(200);

    // The receipt exists (approval worked)...
    const received = await request(server)
      .get('/donations/received')
      .set('Authorization', `Bearer ${informalToken}`)
      .expect(200);
    const donation = received.body.find((d: { id: string }) => d.id === donate.body.id);
    expect(donation.status).toBe('approved');
    expect(donation.receipt).toBeTruthy();

    // ...but no certificate was ever created for it (gating blocked issuance,
    // not a failure of the webhook itself).
    await request(server)
      .get(`/donations/${donate.body.id}/certificate`)
      .set('Authorization', `Bearer ${donorToken}`)
      .expect(404);
    const rows = await admin.donationCertificate.findMany({
      where: { donationId: donate.body.id },
    });
    expect(rows).toHaveLength(0);
  });
});

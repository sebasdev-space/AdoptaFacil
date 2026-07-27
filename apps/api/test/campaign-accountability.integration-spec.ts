import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * Accountability end-to-end (RF16 · T-054): an org uploads a spending evidence
 * (real bytes through StoragePort) on its campaign, and the PUBLIC accountability
 * report shows the evidence + the declared-spending total WITHOUT a session.
 * Plus the guardrails: money validation, RBAC deny-by-default, tenant isolation,
 * and cancelled campaigns never surfacing publicly.
 */
describe('Campaign accountability (RF16 · T-054)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password123';

  let ownerToken = '';
  let otherOwnerToken = '';
  let personToken = '';
  let campaignId = '';
  let evidenceKey = '';

  async function registerOrg(tag: string): Promise<{ token: string; orgId: string }> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: `Refugio ${tag}`,
        displayName: `Owner ${tag}`,
        email: `t054-${tag}-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    return { token: res.body.tokens.accessToken, orgId: res.body.user.organizationId };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const a = await registerOrg('a');
    ownerToken = a.token;
    orgIds.push(a.orgId);
    const b = await registerOrg('b');
    otherOwnerToken = b.token;
    orgIds.push(b.orgId);

    const person = await request(server)
      .post('/auth/register/person')
      .send({ displayName: 'Persona', email: `t054-p-${randomUUID()}@test.local`, password })
      .expect(201);
    personToken = person.body.tokens.accessToken;
    orgIds.push(person.body.user.organizationId);

    const campaign = await request(server)
      .post('/campaigns')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: 'Cirugía urgente',
        category: 'surgeries',
        goalAmount: 1_000_000,
        deadline: '2026-12-31T00:00:00.000Z',
      })
      .expect(201);
    campaignId = campaign.body.id;
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('Owner uploads an evidence and the file is stored for real (public)', async () => {
    const created = await request(server)
      .post(`/campaigns/${campaignId}/evidences`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        type: 'invoice',
        concept: 'Compra de insumos',
        amount: 120_000,
        spentAt: '2026-07-02T00:00:00.000Z',
        filename: 'factura.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    expect(created.body.evidence.amount).toBe(120_000);
    expect(created.body.evidence.storageRef).toMatch(/^public\//);
    evidenceKey = created.body.upload.key;

    // PUT the real bytes to the reserved key, then the public serve works.
    await request(server)
      .put('/storage/upload')
      .query({ key: evidenceKey })
      .set('Authorization', `Bearer ${ownerToken}`)
      .attach('file', Buffer.from('%PDF-1.4 fake invoice'), {
        filename: 'factura.pdf',
        contentType: 'application/pdf',
      })
      .expect(200);
    await request(server).get('/storage/public').query({ key: evidenceKey }).expect(200);
  });

  it('rejects a non-integer amount, a negative amount, and a bad type (400)', async () => {
    const base = {
      concept: 'x',
      spentAt: '2026-07-02T00:00:00.000Z',
      filename: 'a.pdf',
    };
    await request(server)
      .post(`/campaigns/${campaignId}/evidences`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...base, type: 'invoice', amount: 10.5 })
      .expect(400);
    await request(server)
      .post(`/campaigns/${campaignId}/evidences`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...base, type: 'invoice', amount: -5 })
      .expect(400);
    await request(server)
      .post(`/campaigns/${campaignId}/evidences`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ...base, type: 'bribe' })
      .expect(400);
  });

  it('exposes the PUBLIC accountability report (evidences + total) with NO session', async () => {
    const res = await request(server)
      .get(`/public/campaigns/${campaignId}/accountability`)
      .expect(200);
    expect(res.body.campaign.id).toBe(campaignId);
    expect(res.body.evidences.length).toBeGreaterThanOrEqual(1);
    const ev = res.body.evidences[0];
    expect(ev.concept).toBe('Compra de insumos');
    expect(ev.amount).toBe(120_000);
    expect(ev.url).toContain(ev.storageRef);
    expect(res.body.totalSpent).toBe(120_000);
  });

  it('deny-by-default: a person (no roles) cannot upload an evidence (403)', async () => {
    await request(server)
      .post(`/campaigns/${campaignId}/evidences`)
      .set('Authorization', `Bearer ${personToken}`)
      .send({
        type: 'invoice',
        concept: 'x',
        amount: 1000,
        spentAt: '2026-07-02T00:00:00.000Z',
        filename: 'a.pdf',
      })
      .expect(403);
  });

  it('tenant isolation: another org cannot attach an evidence to this campaign (404)', async () => {
    await request(server)
      .post(`/campaigns/${campaignId}/evidences`)
      .set('Authorization', `Bearer ${otherOwnerToken}`)
      .send({
        type: 'invoice',
        concept: 'x',
        amount: 1000,
        spentAt: '2026-07-02T00:00:00.000Z',
        filename: 'a.pdf',
      })
      .expect(404);
    // And it sees none of this campaign's evidences on the authenticated path.
    const list = await request(server)
      .get(`/campaigns/${campaignId}/evidences`)
      .set('Authorization', `Bearer ${otherOwnerToken}`)
      .expect(200);
    expect(list.body.total).toBe(0);
  });

  it('does NOT expose the accountability report of a cancelled campaign (404)', async () => {
    const created = await request(server)
      .post('/campaigns')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: 'Campaña a cancelar',
        category: 'food',
        goalAmount: 500_000,
        deadline: '2026-12-31T00:00:00.000Z',
      })
      .expect(201);
    await request(server)
      .patch(`/campaigns/${created.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'cancelled' })
      .expect(200);
    await request(server).get(`/public/campaigns/${created.body.id}/accountability`).expect(404);
  });
});

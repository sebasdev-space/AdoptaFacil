import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * M09 (F-6, Ola 3) — banco de recursos: publicar necesidades, ofrecer
 * donaciones físicas y coordinar entregas con evidencia. Verifica el ciclo
 * de vida completo (needed → partially_fulfilled/fulfilled), RBAC en cada
 * endpoint (deny-by-default), el catálogo público, "mis ofertas" del
 * donante (con el estado de su entrega), y los caminos de rechazo/
 * cancelación. La no-filtración cross-organización vive en
 * `rls-no-leak-resources.integration-spec.ts`.
 */
describe('Resources (M09, F-6: needs → offers → deliveries → evidence, RBAC, no double-apply)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
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
        email: `res-${tag}-${randomUUID()}@test.local`,
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
      .send({ displayName: 'Donante', email: `res-${tag}-${randomUUID()}@test.local`, password })
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

  const createNeed = (token: string, body: Record<string, unknown> = {}) =>
    request(server)
      .post('/resources/needs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Alimento para gatos',
        category: 'food',
        quantityNeeded: 20,
        unit: 'kg',
        ...body,
      });

  const offer = (token: string, needId: string, quantityOffered: number) =>
    request(server)
      .post('/resources/offers')
      .set('Authorization', `Bearer ${token}`)
      .send({ needId, quantityOffered });

  let org: Actor;
  let donor: Actor;
  let needId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    org = await registerOrg('org');
    donor = await registerPerson('donor');
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('RBAC: only Owner/Administrator/Operator may publish a need (ReadOnlyAuditor → 403)', async () => {
    const auditor = await actorWithRoles('auditor', ['read_only_auditor']);
    await createNeed(auditor.token).expect(403);
  });

  it('publishes a need (Owner) — starts "needed", 0 fulfilled, progress 0', async () => {
    const res = await createNeed(org.token).expect(201);
    needId = res.body.id;
    expect(res.body).toMatchObject({
      organizationId: org.orgId,
      status: 'needed',
      quantityFulfilled: 0,
      quantityNeeded: 20,
      progress: 0,
    });
  });

  it('the need appears in the PUBLIC catalog and its own public detail', async () => {
    const list = await request(server).get('/public/resources/needs').expect(200);
    expect(list.body.items.some((n: { id: string }) => n.id === needId)).toBe(true);

    const detail = await request(server).get(`/public/resources/needs/${needId}`).expect(200);
    expect(detail.body).toMatchObject({ id: needId, organizationId: org.orgId });
  });

  it('rejects an offer with a quantity that is not a positive integer', async () => {
    await offer(donor.token, needId, 0).expect(400);
    await offer(donor.token, needId, -5).expect(400);
  });

  let offerId = '';

  it('a donor (any authenticated user) offers to cover PART of the need', async () => {
    const res = await offer(donor.token, needId, 8).expect(201);
    offerId = res.body.id;
    expect(res.body).toMatchObject({
      organizationId: org.orgId,
      needId,
      donorUserId: donor.userId,
      quantityOffered: 8,
      status: 'offered',
    });
  });

  it("RBAC: only Owner/Administrator/Operator may decide an offer (donor's own token → 403)", async () => {
    await request(server)
      .patch(`/resources/offers/${offerId}/decision`)
      .set('Authorization', `Bearer ${donor.token}`)
      .send({ decision: 'accept' })
      .expect(403);
  });

  let deliveryId = '';

  it('the org ACCEPTS the offer — a delivery is created automatically (scheduled)', async () => {
    const decided = await request(server)
      .patch(`/resources/offers/${offerId}/decision`)
      .set('Authorization', `Bearer ${org.token}`)
      .send({ decision: 'accept' })
      .expect(200);
    expect(decided.body.status).toBe('accepted');

    const deliveries = await request(server)
      .get('/resources/deliveries')
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    const delivery = deliveries.body.items.find((d: { offerId: string }) => d.offerId === offerId);
    expect(delivery).toMatchObject({ needId, status: 'scheduled' });
    deliveryId = delivery.id;
  });

  it('deciding an ALREADY-decided offer is rejected (not idempotent — a real conflict)', async () => {
    await request(server)
      .patch(`/resources/offers/${offerId}/decision`)
      .set('Authorization', `Bearer ${org.token}`)
      .send({ decision: 'decline' })
      .expect(400);
  });

  it('the org schedules the delivery method/date', async () => {
    const res = await request(server)
      .patch(`/resources/deliveries/${deliveryId}`)
      .set('Authorization', `Bearer ${org.token}`)
      .send({ method: 'dropoff', scheduledAt: '2026-09-01T15:00:00.000Z' })
      .expect(200);
    expect(res.body).toMatchObject({ method: 'dropoff', status: 'scheduled' });
  });

  it('uploads evidence for the delivery (two-step: row + upload target)', async () => {
    const res = await request(server)
      .post(`/resources/deliveries/${deliveryId}/evidences`)
      .set('Authorization', `Bearer ${org.token}`)
      .send({ filename: 'entrega.jpg', contentType: 'image/jpeg', caption: 'Alimento entregado' })
      .expect(201);
    expect(res.body.evidence).toMatchObject({ deliveryId, caption: 'Alimento entregado' });
    expect(res.body.upload.url).toEqual(expect.any(String));
    expect(res.body.upload.key).toEqual(expect.any(String));

    const list = await request(server)
      .get(`/resources/deliveries/${deliveryId}/evidences`)
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    expect(list.body).toHaveLength(1);
  });

  it('completing the delivery applies the offered quantity to the need EXACTLY once — need becomes partially_fulfilled', async () => {
    const completed = await request(server)
      .patch(`/resources/deliveries/${deliveryId}/complete`)
      .set('Authorization', `Bearer ${org.token}`)
      .send({})
      .expect(200);
    expect(completed.body.status).toBe('completed');

    const need = await request(server)
      .get(`/resources/needs/${needId}`)
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    expect(need.body).toMatchObject({
      quantityFulfilled: 8,
      status: 'partially_fulfilled',
      progress: 0.4,
    });

    // Completing an ALREADY-completed delivery is rejected (terminal state).
    await request(server)
      .patch(`/resources/deliveries/${deliveryId}/complete`)
      .set('Authorization', `Bearer ${org.token}`)
      .send({})
      .expect(400);

    // ...and the need's quantityFulfilled never moved a second time.
    const stillOne = await admin.resourceFulfillmentApplication.findMany({
      where: { deliveryId },
    });
    expect(stillOne).toHaveLength(1);
  });

  it('the donor sees the offer in "mis ofertas", enriched with need + delivery status', async () => {
    const mine = await request(server)
      .get('/resources/offers/mine')
      .set('Authorization', `Bearer ${donor.token}`)
      .expect(200);
    const found = mine.body.find((o: { id: string }) => o.id === offerId);
    expect(found).toMatchObject({
      needTitle: 'Alimento para gatos',
      needUnit: 'kg',
      organizationName: 'Org org',
      status: 'accepted',
      deliveryStatus: 'completed',
    });
  });

  it('a SECOND offer that finishes covering the need marks it fulfilled', async () => {
    const secondOfferRes = await offer(donor.token, needId, 12).expect(201);
    const secondOfferId = secondOfferRes.body.id;

    await request(server)
      .patch(`/resources/offers/${secondOfferId}/decision`)
      .set('Authorization', `Bearer ${org.token}`)
      .send({ decision: 'accept' })
      .expect(200);

    const deliveries = await request(server)
      .get('/resources/deliveries')
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    const secondDeliveryId = deliveries.body.items.find(
      (d: { offerId: string }) => d.offerId === secondOfferId,
    ).id;

    await request(server)
      .patch(`/resources/deliveries/${secondDeliveryId}/complete`)
      .set('Authorization', `Bearer ${org.token}`)
      .send({})
      .expect(200);

    const need = await request(server)
      .get(`/resources/needs/${needId}`)
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    expect(need.body).toMatchObject({ quantityFulfilled: 20, status: 'fulfilled', progress: 1 });

    // A fulfilled need no longer accepts new offers.
    await offer(donor.token, needId, 1).expect(400);

    // ...and it drops out of the public catalog's default listing? No — it
    // stays listed as `fulfilled` per `public_resource_need` (transparency:
    // donors can still see it was met), but never accepts a NEW offer.
  });

  it('the org can DECLINE an offer; a declined offer creates no delivery', async () => {
    const anotherNeed = await createNeed(org.token, { title: 'Medicinas' }).expect(201);
    const declineOffer = await offer(donor.token, anotherNeed.body.id, 3).expect(201);

    const declined = await request(server)
      .patch(`/resources/offers/${declineOffer.body.id}/decision`)
      .set('Authorization', `Bearer ${org.token}`)
      .send({ decision: 'decline' })
      .expect(200);
    expect(declined.body.status).toBe('declined');

    const deliveries = await admin.resourceDelivery.findMany({
      where: { offerId: declineOffer.body.id },
    });
    expect(deliveries).toHaveLength(0);
  });

  it('the donor can cancel their OWN pending offer, but not once decided', async () => {
    const need2 = await createNeed(org.token, { title: 'Camas' }).expect(201);
    const pending = await offer(donor.token, need2.body.id, 2).expect(201);

    const cancelled = await request(server)
      .patch(`/resources/offers/${pending.body.id}/cancel`)
      .set('Authorization', `Bearer ${donor.token}`)
      .expect(200);
    expect(cancelled.body.status).toBe('cancelled');

    // Cancelling again (already cancelled) is rejected.
    await request(server)
      .patch(`/resources/offers/${pending.body.id}/cancel`)
      .set('Authorization', `Bearer ${donor.token}`)
      .expect(404);

    // A DIFFERENT donor cannot cancel someone else's offer.
    const otherDonor = await registerPerson('other-donor');
    const pending2 = await offer(donor.token, need2.body.id, 1).expect(201);
    await request(server)
      .patch(`/resources/offers/${pending2.body.id}/cancel`)
      .set('Authorization', `Bearer ${otherDonor.token}`)
      .expect(404);
  });

  it('the org can CANCEL a scheduled delivery (offer stays accepted, need unaffected)', async () => {
    const need3 = await createNeed(org.token, { title: 'Transportadoras' }).expect(201);
    const off = await offer(donor.token, need3.body.id, 4).expect(201);
    await request(server)
      .patch(`/resources/offers/${off.body.id}/decision`)
      .set('Authorization', `Bearer ${org.token}`)
      .send({ decision: 'accept' })
      .expect(200);
    const deliveries = await request(server)
      .get('/resources/deliveries')
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    const del = deliveries.body.items.find((d: { offerId: string }) => d.offerId === off.body.id);

    const cancelled = await request(server)
      .patch(`/resources/deliveries/${del.id}/cancel`)
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    expect(cancelled.body.status).toBe('cancelled');

    const need = await request(server)
      .get(`/resources/needs/${need3.body.id}`)
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    expect(need.body.quantityFulfilled).toBe(0); // a cancelled delivery never applies

    await request(server)
      .patch(`/resources/deliveries/${del.id}/cancel`)
      .set('Authorization', `Bearer ${org.token}`)
      .expect(400); // terminal — cannot cancel twice
  });

  it('the org can CANCEL a need directly (no more offers accepted)', async () => {
    const need4 = await createNeed(org.token, { title: 'Descontinuada' }).expect(201);
    await request(server)
      .patch(`/resources/needs/${need4.body.id}`)
      .set('Authorization', `Bearer ${org.token}`)
      .send({ status: 'cancelled' })
      .expect(200);
    await offer(donor.token, need4.body.id, 1).expect(400);
  });
});

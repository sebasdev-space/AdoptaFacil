import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SponsorshipBillingService } from '../src/modules/sponsorships/sponsorship-billing.service';
import { purgeOrganizations } from './support/cleanup';
import { completeTestProfile } from './support/profile';

/**
 * M13 dashboard de donaciones/campañas de la organización (S-14, pedido del
 * cliente: "según el rol pueda ver la información a la que tiene acceso").
 * Verifica que cada sección se muestra/oculta según EXACTAMENTE los mismos
 * roles que ya ven ese dato en su propio módulo (`GET /donations/received`,
 * `GET /campaigns`, `GET /sponsorships`) — nunca un permiso nuevo e
 * inconsistente — con datos reales (no solo un 200 vacío), y aislamiento
 * de tenant.
 */
describe('Org donations/campaigns dashboard (M13, S-14)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let billing: SponsorshipBillingService;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password123';

  interface Actor {
    token: string;
    orgId: string;
    userId: string;
  }

  async function registerOrg(name: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: name,
        displayName: 'Owner',
        email: `s14-o-${randomUUID()}@test.local`,
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
        displayName: `Donante ${tag}`,
        email: `s14-p-${tag}-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    orgIds.push(res.body.user.organizationId);
    await completeTestProfile(admin, res.body.user.id);
    return {
      token: res.body.tokens.accessToken,
      orgId: res.body.user.organizationId,
      userId: res.body.user.id,
    };
  }

  /** Cambia el rol de `actor` EN SU PROPIA org a exactamente `role` — las
   *  guardias de roles consultan la BD en vivo en cada request, así que el
   *  MISMO token ya emitido sigue sirviendo tras el cambio (no hace falta
   *  reautenticar). */
  async function setOwnRole(actor: Actor, role: string): Promise<void> {
    await admin.userRole.deleteMany({ where: { userId: actor.userId } });
    await admin.userRole.create({
      data: { organizationId: actor.orgId, userId: actor.userId, role },
    });
  }

  const dashboard = (token: string) =>
    request(server).get('/org/dashboard/donations').set('Authorization', `Bearer ${token}`);

  async function makeDonation(
    donor: Actor,
    orgId: string,
    status: 'approved' | 'declined',
  ): Promise<void> {
    const idempotencyKey = `s14-don-${randomUUID()}`;
    const donation = await request(server)
      .post('/donations')
      .set('Authorization', `Bearer ${donor.token}`)
      .send({
        organizationId: orgId,
        intendedAmount: 20_000,
        commissionPayer: 'organization',
        idempotencyKey,
      })
      .expect(201);
    await request(server)
      .post('/donations/webhook')
      .set('x-signature', 'fake-sig')
      .send({
        collectionId: donation.body.collectionId,
        status,
        eventId: `s14-evt-${randomUUID()}`,
      })
      .expect(200);
  }

  async function makeCampaign(org: Actor, deadline: string): Promise<string> {
    const res = await request(server)
      .post('/campaigns')
      .set('Authorization', `Bearer ${org.token}`)
      .send({
        title: 'Campaña S14',
        description: 'Campaña de prueba del dashboard de donaciones',
        category: 'medications',
        goalAmount: 200_000,
        deadline,
      })
      .expect(201);
    return res.body.id;
  }

  /** Crea un apadrinamiento activo cuyo período más reciente queda en
   *  `failed` (riesgo de pago) — transición `pending -> failed` es válida
   *  (trigger `sponsorship_payments_validate_transition`, S-5-REDISEÑO), así
   *  que un UPDATE directo del superusuario no necesita bypassear nada. */
  async function makeSponsorshipAtRisk(org: Actor, sponsor: Actor): Promise<void> {
    const animal = await request(server)
      .post('/animals')
      .set('Authorization', `Bearer ${org.token}`)
      .send({
        name: `Firu-S14-${randomUUID().slice(0, 6)}`,
        species: 'dog',
        sex: 'unknown',
        size: 'medium',
      })
      .expect(201);
    const plan = await request(server)
      .post('/sponsorship-plans')
      .set('Authorization', `Bearer ${org.token}`)
      .send({
        animalId: animal.body.id,
        name: 'Padrinazgo S14',
        amount: 30_000,
        periodicity: 'monthly',
      })
      .expect(201);
    const sponsorship = await request(server)
      .post('/sponsorships')
      .set('Authorization', `Bearer ${sponsor.token}`)
      .send({ planId: plan.body.id })
      .expect(201);
    // El primer período de facturación no existe hasta que corre el scan
    // diario (`nextBillingAt` por defecto es `now()` al suscribirse, así que
    // el primer scan ya lo abre) — mismo mecanismo que
    // `sponsorship-billing.integration-spec.ts`.
    await billing.runDailyScan();
    const payments = await request(server)
      .get(`/sponsorships/${sponsorship.body.id}/payments`)
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    await admin.sponsorshipPayment.update({
      where: { id: payments.body[0].id },
      data: { status: 'failed' },
    });
  }

  let org: Actor;
  let donor: Actor;
  let sponsor: Actor;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    billing = app.get(SponsorshipBillingService);

    org = await registerOrg('Refugio Dashboard Donaciones');
    donor = await registerPerson('a');
    sponsor = await registerPerson('b');

    await makeDonation(donor, org.orgId, 'approved');
    await makeDonation(donor, org.orgId, 'declined');
    await makeCampaign(org, new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString());
    await makeSponsorshipAtRisk(org, sponsor);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('Owner sees all three sections with the real fixture data', async () => {
    const res = await dashboard(org.token).expect(200);

    expect(res.body.donations).toMatchObject({ approved: 1, declined: 1 });
    expect(res.body.donations.netReceivedTotal).toBeGreaterThan(0);
    expect(res.body.campaigns).toHaveLength(1);
    expect(res.body.campaigns[0]).toMatchObject({ title: 'Campaña S14', endingSoon: true });
    expect(res.body.sponsorships).toEqual({
      active: 1,
      suspended: 0,
      cancelled: 0,
      atPaymentRisk: 1,
    });
  });

  it('Operator sees donations + campaigns, but NOT sponsorships (matches /sponsorships own RBAC)', async () => {
    await setOwnRole(org, 'operator');

    const res = await dashboard(org.token).expect(200);
    expect(res.body.donations).toBeDefined();
    expect(res.body.campaigns).toBeDefined();
    expect(res.body.sponsorships).toBeUndefined();
  });

  it('ReadOnlyAuditor sees campaigns + sponsorships, but NOT donations (matches /donations/received own RBAC)', async () => {
    await setOwnRole(org, 'read_only_auditor');

    const res = await dashboard(org.token).expect(200);
    expect(res.body.donations).toBeUndefined();
    expect(res.body.campaigns).toBeDefined();
    expect(res.body.sponsorships).toBeDefined();
  });

  it('a role with no dashboard access at all (Volunteer) gets 403', async () => {
    await setOwnRole(org, 'volunteer');

    await dashboard(org.token).expect(403);

    // Restore Owner so any test ordering after this one keeps working.
    await setOwnRole(org, 'owner');
  });

  it("tenant isolation: a different organization never sees this one's donations/campaigns/sponsorships", async () => {
    const otherOrg = await registerOrg('Otro Refugio S14');

    const res = await dashboard(otherOrg.token).expect(200);
    expect(res.body.donations).toMatchObject({
      pending: 0,
      approved: 0,
      declined: 0,
      netReceivedTotal: 0,
    });
    expect(res.body.campaigns).toEqual([]);
    expect(res.body.sponsorships).toEqual({
      active: 0,
      suspended: 0,
      cancelled: 0,
      atPaymentRisk: 0,
    });
  });
});

import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { computeBreakdown } from '@adoptafacil/contracts';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * S2-08 (M13) minimal organization summary: GET /org/summary aggregates
 * counts/totals that already exist elsewhere (animals, adoption requests,
 * sponsorships, documents, formalization, donations) into one response.
 * Verifies EXACT numbers against known seed data (not just a 200), tenant
 * isolation, and RBAC deny-by-default.
 */
describe('Organization summary (S2-08, M13)', () => {
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

  async function registerOrg(name: string): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: name,
        displayName: 'Owner',
        email: `s208-${randomUUID()}@test.local`,
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

  /** Register an org, then set the user's roles EXACTLY to `roles` (superuser) —
   *  same helper as `documents.integration-spec.ts`, needed for a platform_admin. */
  async function actorWithRoles(roles: string[]): Promise<Actor> {
    const actor = await registerOrg('Platform actor');
    await admin.userRole.deleteMany({ where: { userId: actor.userId } });
    for (const role of roles) {
      await admin.userRole.create({
        data: { organizationId: actor.orgId, userId: actor.userId, role },
      });
    }
    return actor;
  }

  async function registerPerson(tag: string): Promise<string> {
    const res = await request(server)
      .post('/auth/register/person')
      .send({ displayName: tag, email: `s208-${tag}-${randomUUID()}@test.local`, password })
      .expect(201);
    orgIds.push(res.body.user.organizationId);
    return res.body.tokens.accessToken;
  }

  const createAnimal = (token: string, body: Record<string, unknown>) =>
    request(server)
      .post('/animals')
      .set('Authorization', `Bearer ${token}`)
      .send({ species: 'dog', sex: 'unknown', size: 'medium', ...body });

  const upload = (token: string, type: string, expiresAt?: string) =>
    request(server)
      .post('/org/documents')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type,
        filename: 'doc.pdf',
        contentType: 'application/pdf',
        ...(expiresAt ? { expiresAt } : {}),
      });

  const decide = (token: string, id: string, decision: string, note?: string) =>
    request(server)
      .post(`/platform/documents/${id}/decision`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision, ...(note ? { note } : {}) });

  let owner: Actor;
  let orgB: Actor;
  let readOnlyAuditor: Actor;
  let platformAdmin: Actor;
  let personA: string;
  let requestAnimalId = '';
  let net1 = 0;
  let net2 = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    owner = await registerOrg('Refugio S2-08');
    orgB = await registerOrg('Refugio B (aislamiento)');
    // The RolesGuard denies by ROLE before any org-scoping matters, so this
    // auditor doesn't need to share `owner`'s org for the deny-by-default test.
    readOnlyAuditor = await actorWithRoles(['read_only_auditor']);
    platformAdmin = await actorWithRoles(['owner', 'platform_admin']);
    personA = await registerPerson('donante');

    // --- animalsActive: 2 available/active, 1 adopted, 1 deactivated -----------
    await createAnimal(owner.token, { name: 'Activo1' }).expect(201);
    await createAnimal(owner.token, { name: 'Activo2' }).expect(201);
    await createAnimal(owner.token, { name: 'Adoptado', status: 'adopted' }).expect(201);
    const inactive = await createAnimal(owner.token, { name: 'Inactivo' }).expect(201);
    await request(server)
      .post(`/animals/${inactive.body.id}/deactivate`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(201);

    // --- adoptionRequestsPending: 'new' + 'in_review' count; 'rejected' doesn't -
    const forRequests = await createAnimal(owner.token, {
      name: 'ParaSolicitudes',
      status: 'in_process',
    }).expect(201);
    requestAnimalId = forRequests.body.id;
    const reqBody = (animalId: string) => ({
      animalId,
      organizationId: owner.orgId,
      animalSnapshot: { animalId, name: 'ParaSolicitudes', species: 'dog' },
      applicant: { fullName: 'Solicitante', email: 'solicitante@test.local' },
      message: 'Quiero adoptar a este animal, tengo espacio y experiencia previa con perros.',
    });
    const req1 = await request(server)
      .post('/adoptions')
      .set('Authorization', `Bearer ${personA}`)
      .send(reqBody(requestAnimalId))
      .expect(201);
    expect(req1.body.status).toBe('new'); // stays 'new' — counts.

    const animal2 = await createAnimal(owner.token, {
      name: 'ParaSolicitudes2',
      status: 'in_process',
    }).expect(201);
    const personB = await registerPerson('solicitante2');
    const req2 = await request(server)
      .post('/adoptions')
      .set('Authorization', `Bearer ${personB}`)
      .send(reqBody(animal2.body.id))
      .expect(201);
    await request(server)
      .post(`/adoptions/${req2.body.id}/transitions`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ targetStatus: 'in_review' })
      .expect(201); // now 'in_review' — counts.

    const animal3 = await createAnimal(owner.token, {
      name: 'ParaSolicitudes3',
      status: 'in_process',
    }).expect(201);
    const personC = await registerPerson('solicitante3');
    const req3 = await request(server)
      .post('/adoptions')
      .set('Authorization', `Bearer ${personC}`)
      .send(reqBody(animal3.body.id))
      .expect(201);
    await request(server)
      .post(`/adoptions/${req3.body.id}/transitions`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ targetStatus: 'in_review' })
      .expect(201);
    await request(server)
      .post(`/adoptions/${req3.body.id}/transitions`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ targetStatus: 'rejected', reason: 'No cumple requisitos' })
      .expect(201); // terminal — does NOT count.

    // --- sponsorshipsActive: 1 active, 1 suspended (excluded) ------------------
    const plan1 = await request(server)
      .post('/sponsorship-plans')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        animalId: requestAnimalId,
        name: 'Plan activo',
        amount: 20_000,
        periodicity: 'monthly',
      })
      .expect(201);
    await request(server)
      .post('/sponsorships')
      .set('Authorization', `Bearer ${personA}`)
      .send({ planId: plan1.body.id })
      .expect(201);

    const plan2 = await request(server)
      .post('/sponsorship-plans')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        animalId: animal2.body.id,
        name: 'Plan suspendido',
        amount: 15_000,
        periodicity: 'monthly',
      })
      .expect(201);
    const sponsorship2 = await request(server)
      .post('/sponsorships')
      .set('Authorization', `Bearer ${personB}`)
      .send({ planId: plan2.body.id })
      .expect(201);
    await request(server)
      .post(`/sponsorships/${sponsorship2.body.id}/suspend`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    // --- documentsExpiringSoon / documentsRejected ------------------------------
    const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(); // within default 30-day window
    const far = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString(); // outside the window

    const docExpiringSoon = await upload(owner.token, 'rut', soon).expect(201);
    await decide(platformAdmin.token, docExpiringSoon.body.document.id, 'approve').expect(201);

    const docFarAway = await upload(
      owner.token,
      'existence_representation_certificate',
      far,
    ).expect(201);
    await decide(platformAdmin.token, docFarAway.body.document.id, 'approve').expect(201);

    const docRejected = await upload(owner.token, 'legal_representative_id').expect(201);
    await decide(platformAdmin.token, docRejected.body.document.id, 'reject', 'Ilegible').expect(
      201,
    );

    await upload(owner.token, 'other').expect(201); // stays 'pending' — counts toward neither.

    // --- donationsReceivedTotal: 2 approved (org-mode + donor-mode), 1 pending --
    const orgModeKey = `s208-org-${randomUUID()}`;
    const donation1 = await request(server)
      .post('/donations')
      .set('Authorization', `Bearer ${personA}`)
      .send({
        organizationId: owner.orgId,
        intendedAmount: 50_000,
        commissionPayer: 'organization',
        idempotencyKey: orgModeKey,
      })
      .expect(201);
    net1 = computeBreakdown(50_000, 'organization').net;
    await request(server)
      .post('/donations/webhook')
      .set('x-payment-signature', 'fake-sig')
      .send({
        collectionId: donation1.body.collectionId,
        status: 'approved',
        eventId: `s208-evt-1-${randomUUID()}`,
      })
      .expect(200);

    const donorModeKey = `s208-donor-${randomUUID()}`;
    const donation2 = await request(server)
      .post('/donations')
      .set('Authorization', `Bearer ${personA}`)
      .send({
        organizationId: owner.orgId,
        intendedAmount: 30_000,
        commissionPayer: 'donor',
        idempotencyKey: donorModeKey,
      })
      .expect(201);
    net2 = computeBreakdown(30_000, 'donor').net;
    await request(server)
      .post('/donations/webhook')
      .set('x-payment-signature', 'fake-sig')
      .send({
        collectionId: donation2.body.collectionId,
        status: 'approved',
        eventId: `s208-evt-2-${randomUUID()}`,
      })
      .expect(200);

    // A 3rd donation left PENDING (no webhook) — must NOT count.
    await request(server)
      .post('/donations')
      .set('Authorization', `Bearer ${personA}`)
      .send({
        organizationId: owner.orgId,
        intendedAmount: 99_000,
        commissionPayer: 'organization',
        idempotencyKey: `s208-pending-${randomUUID()}`,
      })
      .expect(201);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('returns every exact count/total for the authenticated org (Owner)', async () => {
    const res = await request(server)
      .get('/org/summary')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(res.body.animalsActive).toBe(2);
    expect(res.body.adoptionRequestsPending).toBe(2); // 'new' + 'in_review', not 'rejected'
    expect(res.body.sponsorshipsActive).toBe(1); // not the suspended one
    expect(res.body.documentsExpiringSoon).toBe(1); // only the near-expiry Approved one
    expect(res.body.documentsRejected).toBe(1);
    expect(res.body.donationsReceivedTotal).toBe(net1 + net2); // not the pending one
    expect(res.body.formalizationLevel).toBe(2); // Rut + ExistenceCert approved, Informal blocks tier 3
    expect(res.body.formalizationPercent).toBe(0); // Informal = position 0 of 5
  });

  it('cross-checks donationsReceivedTotal against computeBreakdown — the single source of money math', async () => {
    // No pre-existing public display of an org-wide donation total exists yet
    // (verified during inventory: the public portal only has a typed placeholder
    // for "rendición de cuentas" — S2-08 closing report). This cross-check
    // instead verifies the summary's total against an INDEPENDENT computation
    // via `computeBreakdown`, the single source of truth this codebase already
    // uses for all money math (same helper `donations.integration-spec.ts` uses).
    const res = await request(server)
      .get('/org/summary')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    const expected =
      computeBreakdown(50_000, 'organization').net + computeBreakdown(30_000, 'donor').net;
    expect(res.body.donationsReceivedTotal).toBe(expected);
  });

  it('reports all-zero for an org with no data at all (never null, never an error)', async () => {
    const res = await request(server)
      .get('/org/summary')
      .set('Authorization', `Bearer ${orgB.token}`)
      .expect(200);
    expect(res.body).toEqual({
      animalsActive: 0,
      adoptionRequestsPending: 0,
      sponsorshipsActive: 0,
      documentsExpiringSoon: 0,
      documentsRejected: 0,
      donationsReceivedTotal: 0,
      formalizationLevel: 0,
      formalizationPercent: 0,
    });
  });

  it('never mixes another organization’s numbers (tenant isolation)', async () => {
    const summaryB = await request(server)
      .get('/org/summary')
      .set('Authorization', `Bearer ${orgB.token}`)
      .expect(200);
    expect(summaryB.body.animalsActive).toBe(0);
    expect(summaryB.body.donationsReceivedTotal).toBe(0);
  });

  it('deny-by-default: ReadOnlyAuditor and an unauthenticated caller are refused', async () => {
    await request(server)
      .get('/org/summary')
      .set('Authorization', `Bearer ${readOnlyAuditor.token}`)
      .expect(403);
    await request(server).get('/org/summary').expect(401);
  });
});

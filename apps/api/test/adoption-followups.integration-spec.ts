import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { FollowUpService } from '../src/modules/adoptions/followup.service';
import { purgeOrganizations } from './support/cleanup';

/**
 * M04 post-adoption FOLLOW-UP (T-028c, RF12) end-to-end: from a SIGNED contract the
 * org schedules milestones; the adopter (cross-tenant Person) responds with answers
 * + a photo (fake StoragePort) and completes; the worker marks a past-due milestone
 * overdue and alerts (fake NotificationPort). Verifies role gating, adopter identity,
 * the trackingRef seam, audit (UTC) and cross-org isolation.
 */
describe('Adoption follow-up (M04: post-adoption tracking)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password123';
  const longMessage =
    'Tengo hogar y experiencia; deseo adoptar de forma responsable a este animal.';

  let refugeToken = '';
  let refugeOrgId = '';
  let personToken = '';
  let otherToken = '';
  let animalId = '';
  let requestId = '';
  let contractId = '';
  let futureMilestoneId = '';
  let overdueMilestoneId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const refuge = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: 'Refugio Seguimiento',
        displayName: 'Owner Refugio',
        email: `t028c-refuge-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    refugeToken = refuge.body.tokens.accessToken;
    refugeOrgId = refuge.body.user.organizationId;
    orgIds.push(refugeOrgId);

    const person = await request(server)
      .post('/auth/register/person')
      .send({
        displayName: 'Persona Adoptante',
        email: `t028c-p-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    personToken = person.body.tokens.accessToken;
    orgIds.push(person.body.user.organizationId);

    const other = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: 'Otro Refugio',
        displayName: 'Owner Otro',
        email: `t028c-other-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    otherToken = other.body.tokens.accessToken;
    orgIds.push(other.body.user.organizationId);

    const animal = await request(server)
      .post('/animals')
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({ name: 'Firulais', species: 'dog', sex: 'male', size: 'medium' })
      .expect(201);
    animalId = animal.body.id;

    const req = await request(server)
      .post('/adoptions')
      .set('Authorization', `Bearer ${personToken}`)
      .send({
        animalId,
        organizationId: refugeOrgId,
        animalSnapshot: { animalId, name: 'Firulais', species: 'dog' },
        applicant: { fullName: 'Persona Adoptante', email: 'adoptante@test.local' },
        message: longMessage,
      })
      .expect(201);
    requestId = req.body.id;

    for (const targetStatus of ['in_review', 'approved']) {
      await request(server)
        .post(`/adoptions/${requestId}/transitions`)
        .set('Authorization', `Bearer ${refugeToken}`)
        .send({ targetStatus })
        .expect(201);
    }

    // Generate + fully sign the contract (T-028b) so follow-up is enabled.
    const contract = await request(server)
      .post('/adoptions/contracts')
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({ requestId })
      .expect(201);
    contractId = contract.body.id;
    const orgSignerId = contract.body.signers.find(
      (s: { role: string }) => s.role === 'organization_representative',
    ).id;
    const adopterSignerId = contract.body.signers.find(
      (s: { role: string }) => s.role === 'adopter',
    ).id;
    await request(server)
      .post(`/adoptions/contracts/${contractId}/transitions`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({ targetStatus: 'pending_signatures' })
      .expect(201);
    await request(server)
      .post(`/adoptions/contracts/${contractId}/signatures`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({ signerId: orgSignerId })
      .expect(201);
    await request(server)
      .post(`/adoptions/contracts/${contractId}/signatures`)
      .set('Authorization', `Bearer ${personToken}`)
      .send({ signerId: adopterSignerId })
      .expect(201);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app.close();
  });

  it('lets an org role schedule milestones on a signed contract and materializes trackingRef', async () => {
    const future = await request(server)
      .post('/adoptions/followups')
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({
        contractId,
        title: 'Visita a los 30 días',
        dueAt: '2030-01-01T00:00:00.000Z',
        questionnaire: [{ prompt: '¿Cómo está el animal?', kind: 'text', required: true }],
      })
      .expect(201);
    expect(future.body.status).toBe('scheduled');
    expect(future.body.questionnaire[0].id).toBeTruthy();
    futureMilestoneId = future.body.id;

    const overdue = await request(server)
      .post('/adoptions/followups')
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({ contractId, title: 'Chequeo inicial', dueAt: '2020-01-01T00:00:00.000Z' })
      .expect(201);
    overdueMilestoneId = overdue.body.id;

    // The T-028a/b trackingRef seam is now materialized on the request.
    const kanban = await request(server)
      .get('/adoptions')
      .set('Authorization', `Bearer ${refugeToken}`)
      .expect(200);
    const mine = kanban.body.find((r: { id: string }) => r.id === requestId);
    expect(mine.trackingRef).toBe(contractId);
  });

  it('denies scheduling to a person without an org role (deny-by-default, 403)', async () => {
    await request(server)
      .post('/adoptions/followups')
      .set('Authorization', `Bearer ${personToken}`)
      .send({ contractId, title: 'No permitido', dueAt: '2030-06-01T00:00:00.000Z' })
      .expect(403);
  });

  it('lets the adopter list and respond THEIR milestone with answers + a photo (StoragePort)', async () => {
    const mine = await request(server)
      .get('/adoptions/followups/mine')
      .set('Authorization', `Bearer ${personToken}`)
      .expect(200);
    expect(mine.body.some((m: { id: string }) => m.id === futureMilestoneId)).toBe(true);

    const submitted = await request(server)
      .post(`/adoptions/followups/${futureMilestoneId}/submit`)
      .set('Authorization', `Bearer ${personToken}`)
      .send({
        answers: { estado: 'saludable y feliz' },
        photoFilename: 'perro.jpg',
        complete: true,
      })
      .expect(201);
    expect(submitted.body.status).toBe('completed');
  });

  it("forbids a person from responding someone else's milestone (identity gate, 404)", async () => {
    // The other org's owner is not the adopter → the SECURITY DEFINER read finds nothing.
    await request(server)
      .post(`/adoptions/followups/${overdueMilestoneId}/submit`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ answers: { x: 1 } })
      .expect(404);
  });

  it('marks a past-due milestone overdue and alerts via the worker scan (audited, UTC)', async () => {
    const service = app.get(FollowUpService);
    const overdue = await service.runOverdueScan();
    expect(overdue.some((m) => m.id === overdueMilestoneId)).toBe(true);

    const events = await admin.auditLog.findMany({
      where: { entityId: overdueMilestoneId, entityType: 'adoption_followup_milestone' },
    });
    const actions = events.map((e) => e.action);
    expect(actions).toContain('adoption.followup.overdue');
    expect(actions).toContain('adoption.followup.alert_sent');
    expect(events.every((e) => !Number.isNaN(e.createdAt.getTime()))).toBe(true);
  });

  it('never exposes the follow-up to another organization (RLS + gating)', async () => {
    const otherView = await request(server)
      .get(`/adoptions/followups/by-contract/${contractId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    expect(otherView.body).toHaveLength(0);
  });
});

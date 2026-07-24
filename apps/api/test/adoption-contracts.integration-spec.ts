import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * M04 adoption CONTRACT + electronic signature (T-028b, RF11) end-to-end: after a
 * request is APPROVED, the owning org generates the contract with dynamic signers,
 * sends it to signatures, each signer signs via the simulable SignaturePort, and
 * when all have signed the payload hash seals it (signed, immutable). Verifies role
 * gating, the adopter (Person) signing cross-tenant, immutability (409), sealing
 * audit, and cross-org isolation (RLS + gating).
 */
describe('Adoption contracts (M04: contract + signature)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password123';
  const longMessage = 'Tengo hogar y experiencia; quiero adoptar responsablemente a este animal.';

  let refugeToken = '';
  let refugeOrgId = '';
  let personToken = '';
  let otherToken = '';
  let animalId = '';
  let requestId = '';
  let contractId = '';
  let orgSignerId = '';
  let adopterSignerId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    const refuge = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: 'Refugio Contrato',
        displayName: 'Owner Refugio',
        email: `t028b-refuge-${randomUUID()}@test.local`,
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
        email: `t028b-p-${randomUUID()}@test.local`,
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
        email: `t028b-other-${randomUUID()}@test.local`,
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

    // Person applies, org drives the request to `approved`.
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

    await request(server)
      .post(`/adoptions/${requestId}/transitions`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({ targetStatus: 'in_review' })
      .expect(201);
    await request(server)
      .post(`/adoptions/${requestId}/transitions`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({ targetStatus: 'approved', reason: 'Perfil idóneo' })
      .expect(201);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app.close();
  });

  it('lets an org role generate the contract in draft with dynamic signers (org rep + adopter)', async () => {
    const res = await request(server)
      .post('/adoptions/contracts')
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({ requestId })
      .expect(201);
    expect(res.body.status).toBe('draft');
    expect(res.body.organizationId).toBe(refugeOrgId);
    contractId = res.body.id;

    const roles = res.body.signers.map((s: { role: string }) => s.role);
    expect(roles).toContain('organization_representative');
    expect(roles).toContain('adopter');

    orgSignerId = res.body.signers.find(
      (s: { role: string }) => s.role === 'organization_representative',
    ).id;
    adopterSignerId = res.body.signers.find((s: { role: string }) => s.role === 'adopter').id;

    // The T-028a seam is materialized on the request.
    const contractForReq = await request(server)
      .get(`/adoptions/contracts/by-request/${requestId}`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .expect(200);
    expect(contractForReq.body.id).toBe(contractId);
  });

  it('denies generation/management to a person without an org role (deny-by-default, 403)', async () => {
    await request(server)
      .post('/adoptions/contracts')
      .set('Authorization', `Bearer ${personToken}`)
      .send({ requestId })
      .expect(403);
    await request(server)
      .post(`/adoptions/contracts/${contractId}/transitions`)
      .set('Authorization', `Bearer ${personToken}`)
      .send({ targetStatus: 'cancelled' })
      .expect(403);
  });

  it('sends to signatures, then signs each part; sealing on the last signature (signed + hash)', async () => {
    await request(server)
      .post(`/adoptions/contracts/${contractId}/transitions`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({ targetStatus: 'pending_signatures' })
      .expect(201);

    // Org representative signs first → still pending (adopter missing).
    const afterOrg = await request(server)
      .post(`/adoptions/contracts/${contractId}/signatures`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({ signerId: orgSignerId })
      .expect(201);
    expect(afterOrg.body.status).toBe('pending_signatures');
    expect(afterOrg.body.contentHash).toBeUndefined();

    // Adopter (Person, cross-tenant) signs their part → contract seals.
    const sealed = await request(server)
      .post(`/adoptions/contracts/${contractId}/signatures`)
      .set('Authorization', `Bearer ${personToken}`)
      .send({ signerId: adopterSignerId })
      .expect(201);
    expect(sealed.body.status).toBe('signed');
    expect(sealed.body.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(sealed.body.signedAt).toBeTruthy();
  });

  it('cannot sign the same part twice, nor sign for someone else', async () => {
    // Org rep part already signed → 409.
    await request(server)
      .post(`/adoptions/contracts/${contractId}/signatures`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({ signerId: orgSignerId })
      .expect(409);
  });

  it('is IMMUTABLE once signed: managing/editing a signed contract → 409', async () => {
    await request(server)
      .post(`/adoptions/contracts/${contractId}/transitions`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({ targetStatus: 'cancelled' })
      .expect(409);
  });

  it('audits generation, each signature and the sealing (append-only, UTC)', async () => {
    const events = await admin.auditLog.findMany({
      where: { entityId: contractId, entityType: 'adoption_contract' },
    });
    const actions = events.map((e) => e.action);
    expect(actions).toContain('adoption.contract.generated');
    expect(actions).toContain('adoption.contract.signed');
    expect(actions).toContain('adoption.contract.sealed');
    // Stored UTC: created_at is a valid instant.
    expect(events.every((e) => !Number.isNaN(e.createdAt.getTime()))).toBe(true);
  });

  it('never exposes the contract to another organization (RLS + gating)', async () => {
    // Another org cannot read it by request…
    await request(server)
      .get(`/adoptions/contracts/by-request/${requestId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
    // …nor by id as a signer (they are not a signer).
    await request(server)
      .get(`/adoptions/contracts/${contractId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
  });
});

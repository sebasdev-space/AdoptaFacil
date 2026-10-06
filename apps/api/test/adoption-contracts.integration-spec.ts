import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';
import { completeTestProfile } from './support/profile';

/** A minimal but genuinely valid 1x1 PNG — `embedPng` must accept it. Same
 *  constant already used by `legal-representative`/`volunteering` specs. */
const SIGNATURE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const binaryParser = (res: any, cb: (err: Error | null, body: Buffer) => void): void => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

/**
 * M04 adoption CONTRACT + REAL legal text + REAL signatures (T-028b, RF11,
 * nuevo requerimiento): after a request is APPROVED, the owning org generates
 * the contract (auto-filled with data the system already has: org NIT/
 * domicilio, animal raza/sexo/edad, adoptante cédula/domicilio), fills in the
 * NEW fields (peso, estado de salud), the REPRESENTATIVE signs first — reusing
 * the org's already-registered legal representative signature (requerimiento
 * #16), never drawing a new one — only THEN can the contract be sent to the
 * adopter, who signs by drawing/uploading their own signature image. Sealed
 * (hash, immutable) once both have signed; downloadable as a real PDF at any
 * point. Verifies role gating, the sign-order gate, immutability, audit, and
 * cross-org isolation (RLS + gating).
 */
describe('Adoption contracts (M04: contract + signature, nuevo requerimiento)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgIds: string[] = [];
  const password = 'password123';
  const longMessage = 'Tengo hogar y experiencia; quiero adoptar responsablemente a este animal.';

  let refugeToken = '';
  let refugeOrgId = '';
  let personToken = '';
  let personUserId = '';
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

    // Auto-rellenado: NIT + domicilio de la organización.
    await request(server)
      .put('/org/profile')
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({
        nit: `900${randomUUID().replace(/\D/g, '').slice(0, 6)}-1`,
        location: {
          country: 'Colombia',
          department: 'Cundinamarca',
          city: 'Bogotá',
          address: 'Calle 1 # 2-3',
        },
      })
      .expect(200);

    // Representante legal — requerimiento #16; la firma del contrato lo reutiliza.
    await request(server)
      .post('/org/legal-representative')
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({
        role: 'legal_representative',
        fullName: 'María Fernanda Gómez',
        documentType: 'cedula_ciudadania',
        documentNumber: '52.741.900',
        position: 'Directora ejecutiva',
        signatureBase64: SIGNATURE_PNG,
        signatureContentType: 'image/png',
      })
      .expect(201);

    const person = await request(server)
      .post('/auth/register/person')
      .send({
        displayName: 'Persona Adoptante',
        email: `t028b-p-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    personToken = person.body.tokens.accessToken;
    personUserId = person.body.user.id;
    orgIds.push(person.body.user.organizationId);
    // Auto-rellenado: cédula + domicilio del adoptante.
    await completeTestProfile(admin, personUserId);

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
      .send({
        name: 'Firulais',
        species: 'dog',
        sex: 'male',
        size: 'medium',
        approximateAgeMonths: 24,
      })
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

  it('generates the contract in draft, auto-filled with data the system already has', async () => {
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

    const { data } = res.body.payload;
    expect(data.organizationAddress).toMatch(/Calle 1/);
    expect(data.organizationNit).toMatch(/^900/);
    expect(data.animalSex).toBe('male');
    expect(data.animalAgeYears).toBe(2);
    expect(data.adopterDocumentNumber).toBe('1000000000');
    expect(data.adopterAddress).toMatch(/Bogotá/);
    expect(data.followUpMonths).toBe(6);
    // Lo nuevo (peso/estado de salud) NO existe en ningún otro lugar del
    // sistema — queda sin llenar hasta que la organización lo diligencie.
    expect(data.weightKg).toBeUndefined();
    expect(data.healthStatusAtDelivery).toBeUndefined();

    // The T-028a seam is materialized on the request.
    const contractForReq = await request(server)
      .get(`/adoptions/contracts/by-request/${requestId}`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .expect(200);
    expect(contractForReq.body.id).toBe(contractId);

    // Bug real reportado: la imagen de firma de un firmante que AÚN no ha
    // firmado devuelve 404 — esa respuesta debe llevar `Cache-Control:
    // no-store`, o un navegador la cachea y la sigue sirviendo aunque esa
    // parte YA haya firmado en una visita posterior a la misma URL.
    const notSignedYet = await request(server)
      .get(`/adoptions/contracts/org/${contractId}/signatures/${orgSignerId}/image`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .expect(404);
    expect(notSignedYet.headers['cache-control']).toBe('no-store');
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
    await request(server)
      .patch(`/adoptions/contracts/${contractId}/data`)
      .set('Authorization', `Bearer ${personToken}`)
      .send({ weightKg: 10 })
      .expect(403);
  });

  it('diligenciar los datos: PATCH llena peso + estado de salud (y corrige cualquier otro campo)', async () => {
    const res = await request(server)
      .patch(`/adoptions/contracts/${contractId}/data`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({ weightKg: 18.5, healthStatusAtDelivery: 'Sano, vacunado y esterilizado.' })
      .expect(200);
    expect(res.body.payload.data.weightKg).toBe(18.5);
    expect(res.body.payload.data.healthStatusAtDelivery).toBe('Sano, vacunado y esterilizado.');
    // El resto de los datos auto-rellenados no se pierde con un PATCH parcial.
    expect(res.body.payload.data.animalSex).toBe('male');
  });

  it('orden de firmas reforzado: no se puede enviar a firmas antes de que el representante firme (409)', async () => {
    await request(server)
      .post(`/adoptions/contracts/${contractId}/transitions`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({ targetStatus: 'pending_signatures' })
      .expect(409);
  });

  it('bloquea firmar como representante si la organización nunca registró uno', async () => {
    // Org completamente distinta, sin representante legal registrado.
    const bare = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: 'Refugio Sin Representante',
        displayName: 'Owner Bare',
        email: `t028b-bare-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    orgIds.push(bare.body.user.organizationId);
    const bareToken = bare.body.tokens.accessToken;

    const bareAnimal = await request(server)
      .post('/animals')
      .set('Authorization', `Bearer ${bareToken}`)
      .send({ name: 'Luna', species: 'cat', sex: 'female', size: 'small' })
      .expect(201);
    const bareReq = await request(server)
      .post('/adoptions')
      .set('Authorization', `Bearer ${personToken}`)
      .send({
        animalId: bareAnimal.body.id,
        organizationId: bare.body.user.organizationId,
        animalSnapshot: { animalId: bareAnimal.body.id, name: 'Luna', species: 'cat' },
        applicant: { fullName: 'Persona Adoptante', email: 'adoptante@test.local' },
        message: longMessage,
      })
      .expect(201);
    await request(server)
      .post(`/adoptions/${bareReq.body.id}/transitions`)
      .set('Authorization', `Bearer ${bareToken}`)
      .send({ targetStatus: 'in_review' })
      .expect(201);
    await request(server)
      .post(`/adoptions/${bareReq.body.id}/transitions`)
      .set('Authorization', `Bearer ${bareToken}`)
      .send({ targetStatus: 'approved' })
      .expect(201);
    const bareContract = await request(server)
      .post('/adoptions/contracts')
      .set('Authorization', `Bearer ${bareToken}`)
      .send({ requestId: bareReq.body.id })
      .expect(201);
    const bareOrgSignerId = bareContract.body.signers.find(
      (s: { role: string }) => s.role === 'organization_representative',
    ).id;

    const blocked = await request(server)
      .post(`/adoptions/contracts/${bareContract.body.id}/signatures`)
      .set('Authorization', `Bearer ${bareToken}`)
      .send({ signerId: bareOrgSignerId })
      .expect(400);
    expect(blocked.body.message).toMatch(/representante legal/i);
  });

  it('firma el representante EN BORRADOR (reutiliza la firma ya registrada, sin dibujar nada nuevo)', async () => {
    const res = await request(server)
      .post(`/adoptions/contracts/${contractId}/signatures`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({ signerId: orgSignerId }) // sin signatureBase64 — no hace falta
      .expect(201);
    expect(res.body.status).toBe('draft'); // aún no se envía solo por firmar
    const repSigner = res.body.signers.find((s: { id: string }) => s.id === orgSignerId);
    expect(repSigner.signedAt).toBeTruthy();
    expect(repSigner.fullName).toBe('María Fernanda Gómez'); // reemplazó el placeholder
    expect(repSigner.signatureFileRef).toBeUndefined(); // nunca se duplica el archivo
  });

  it('una vez firmado el representante, el contenido queda congelado (PATCH de datos → 409)', async () => {
    await request(server)
      .patch(`/adoptions/contracts/${contractId}/data`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({ weightKg: 99 })
      .expect(409);
  });

  it('el adoptante no puede firmar mientras el contrato sigue en borrador (409)', async () => {
    await request(server)
      .post(`/adoptions/contracts/${contractId}/signatures`)
      .set('Authorization', `Bearer ${personToken}`)
      .send({ signerId: adopterSignerId, signatureBase64: SIGNATURE_PNG })
      .expect(409);
  });

  it('ahora sí se puede enviar a firmas (el representante ya firmó)', async () => {
    const res = await request(server)
      .post(`/adoptions/contracts/${contractId}/transitions`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({ targetStatus: 'pending_signatures' })
      .expect(201);
    expect(res.body.status).toBe('pending_signatures');
  });

  it('el adoptante DEBE dibujar/subir su firma — sin ella, 400', async () => {
    await request(server)
      .post(`/adoptions/contracts/${contractId}/signatures`)
      .set('Authorization', `Bearer ${personToken}`)
      .send({ signerId: adopterSignerId })
      .expect(400);
  });

  it('el adoptante firma dibujando/subiendo su imagen → el contrato SELLA (hash + inmutable)', async () => {
    const sealed = await request(server)
      .post(`/adoptions/contracts/${contractId}/signatures`)
      .set('Authorization', `Bearer ${personToken}`)
      .send({
        signerId: adopterSignerId,
        signatureBase64: SIGNATURE_PNG,
        signatureContentType: 'image/png',
      })
      .expect(201);
    expect(sealed.body.status).toBe('signed');
    expect(sealed.body.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(sealed.body.signedAt).toBeTruthy();
    const adopterSigner = sealed.body.signers.find((s: { id: string }) => s.id === adopterSignerId);
    expect(adopterSigner.signatureHash).toMatch(/^[0-9a-f]{64}$/);
    expect(adopterSigner.signatureFileRef).toEqual(expect.any(String));
  });

  it('cannot sign the same part twice, nor sign for someone else', async () => {
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
    await request(server)
      .patch(`/adoptions/contracts/${contractId}/data`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .send({ weightKg: 1 })
      .expect(409);
  });

  it('descarga el contrato sellado como un PDF real, con ambas firmas embebidas', async () => {
    const pdf = await request(server)
      .get(`/adoptions/contracts/${contractId}/pdf`)
      .set('Authorization', `Bearer ${personToken}`)
      .buffer()
      .parse(binaryParser)
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    const bytes = pdf.body as Buffer;
    expect(bytes.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(500);
  });

  it('cualquier org manager (no solo quien generó el contrato) también puede descargar el PDF', async () => {
    const pdf = await request(server)
      .get(`/adoptions/contracts/org/${contractId}/pdf`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .buffer()
      .parse(binaryParser)
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
  });

  it('nuevo requerimiento: la vista en pantalla puede pedir la imagen REAL de cada firma (no solo el nombre)', async () => {
    const asOrg = await request(server)
      .get(`/adoptions/contracts/org/${contractId}/signatures/${orgSignerId}/image`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .buffer()
      .parse(binaryParser)
      .expect(200);
    expect(asOrg.headers['content-type']).toContain('image/png');
    expect(asOrg.headers['cache-control']).toBe('no-store');
    expect(asOrg.body.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a'); // magic bytes PNG

    // El ADOPTANTE también puede ver la firma del REPRESENTANTE (y viceversa)
    // — ambas partes del mismo contrato, no solo la propia.
    const repSeenByAdopter = await request(server)
      .get(`/adoptions/contracts/${contractId}/signatures/${orgSignerId}/image`)
      .set('Authorization', `Bearer ${personToken}`)
      .buffer()
      .parse(binaryParser)
      .expect(200);
    expect(repSeenByAdopter.headers['content-type']).toContain('image/png');

    const adopterSeenByOrg = await request(server)
      .get(`/adoptions/contracts/${contractId}/signatures/${adopterSignerId}/image`)
      .set('Authorization', `Bearer ${refugeToken}`)
      .buffer()
      .parse(binaryParser)
      .expect(200);
    expect(adopterSeenByOrg.headers['content-type']).toContain('image/png');
  });

  it('otra organización no puede leer las imágenes de firma (RLS + gating)', async () => {
    await request(server)
      .get(`/adoptions/contracts/org/${contractId}/signatures/${orgSignerId}/image`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
    await request(server)
      .get(`/adoptions/contracts/${contractId}/signatures/${orgSignerId}/image`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
  });

  it('audits generation, data updates, each signature and the sealing (append-only, UTC)', async () => {
    const events = await admin.auditLog.findMany({
      where: { entityId: contractId, entityType: 'adoption_contract' },
    });
    const actions = events.map((e) => e.action);
    expect(actions).toContain('adoption.contract.generated');
    expect(actions).toContain('adoption.contract.data_updated');
    expect(actions).toContain('adoption.contract.signed');
    expect(actions).toContain('adoption.contract.sealed');
    expect(events.every((e) => !Number.isNaN(e.createdAt.getTime()))).toBe(true);
  });

  it('never exposes the contract to another organization (RLS + gating)', async () => {
    await request(server)
      .get(`/adoptions/contracts/by-request/${requestId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
    await request(server)
      .get(`/adoptions/contracts/${contractId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
  });
});

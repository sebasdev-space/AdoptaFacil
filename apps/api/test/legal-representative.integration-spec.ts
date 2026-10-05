import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * M01 legal representative signature (S-1, RF14 relacionado / RNF10):
 * registration is Owner-only (deny-by-default), append-only (a re-registration
 * never mutates the previous row and both survive), audited (metadata only,
 * never the signature bytes), and DB-immutable even against a superuser.
 */
describe('Legal representative signature (M01, S-1)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const password = 'password123';

  interface Actor {
    token: string;
    orgId: string;
    userId: string;
  }

  async function registerOrg(name = 'Org'): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: name,
        displayName: 'Owner',
        email: `s1-legalrep-${randomUUID()}@test.local`,
        password,
      })
      .expect(201);
    createdOrgIds.push(res.body.user.organizationId);
    return {
      token: res.body.tokens.accessToken,
      orgId: res.body.user.organizationId,
      userId: res.body.user.id,
    };
  }

  /** Register an org, then set the user's roles EXACTLY to `roles` (superuser). */
  async function actorWithRoles(roles: string[]): Promise<Actor> {
    const actor = await registerOrg();
    await admin.userRole.deleteMany({ where: { userId: actor.userId } });
    for (const role of roles) {
      await admin.userRole.create({
        data: { organizationId: actor.orgId, userId: actor.userId, role },
      });
    }
    return actor;
  }

  const SIGNATURE_BASE64 = Buffer.from('a tiny fake signature image, not real bytes').toString(
    'base64',
  );

  const register = (
    token: string,
    fullName = 'Ana Pérez',
    signatureBase64 = SIGNATURE_BASE64,
    role: 'legal_representative' | 'accountant' | 'fiscal_reviewer' = 'legal_representative',
  ) =>
    request(server).post('/org/legal-representative').set('Authorization', `Bearer ${token}`).send({
      role,
      fullName,
      documentType: 'cedula_ciudadania',
      documentNumber: '123456789',
      position: 'Representante legal',
      signatureBase64,
      signatureContentType: 'image/png',
    });

  const getCurrent = (token: string) =>
    request(server).get('/org/legal-representative').set('Authorization', `Bearer ${token}`);

  let owner: Actor;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
    owner = await registerOrg('Refugio Legal Rep');
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('lets the Owner register a legal representative (201) with the stable contract shape', async () => {
    const res = await register(owner.token).expect(201);
    expect(res.body).toMatchObject({
      organizationId: owner.orgId,
      memberId: owner.userId,
      role: 'legal_representative',
      fullName: 'Ana Pérez',
      documentType: 'cedula_ciudadania',
      documentNumber: '123456789',
      position: 'Representante legal',
      status: 'active',
    });
    expect(res.body.id).toEqual(expect.any(String));
    // Never the raw signature — only an opaque storage key + its hash.
    expect(res.body.signatureFileRef).toEqual(expect.any(String));
    expect(res.body.signatureHash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.signedAt).toEqual(expect.any(String));
    expect(res.body.createdAt).toEqual(expect.any(String));
    expect(res.body).not.toHaveProperty('signatureBase64');
  });

  it('the Owner can read it back via GET /org/legal-representative (one entry per role)', async () => {
    const res = await getCurrent(owner.token).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    const legalRep = res.body.find((r: { role: string }) => r.role === 'legal_representative');
    expect(legalRep?.fullName).toBe('Ana Pérez');
  });

  it('rejects registration from a non-Owner (Administrator) with 403 (deny-by-default)', async () => {
    const administrator = await actorWithRoles(['administrator']);
    await register(administrator.token).expect(403);
  });

  it('rejects registration from a user with no role at all with 403', async () => {
    const noRole = await actorWithRoles([]);
    await register(noRole.token).expect(403);
  });

  it('re-registering (change of representative) keeps the previous row (append-only) and GET returns the newest', async () => {
    const first = await register(owner.token, 'Primer Representante').expect(201);
    // A real clock tick so `signedAt` orders deterministically.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await register(owner.token, 'Segundo Representante').expect(201);
    expect(second.body.id).not.toBe(first.body.id);

    const current = await getCurrent(owner.token).expect(200);
    const legalRep = current.body.find((r: { role: string }) => r.role === 'legal_representative');
    expect(legalRep?.fullName).toBe('Segundo Representante');

    const allRows = await admin.legalRepresentative.findMany({
      where: { organizationId: owner.orgId },
    });
    expect(allRows.some((r) => r.id === first.body.id)).toBe(true);
    expect(allRows.some((r) => r.id === second.body.id)).toBe(true);
  });

  it('requerimiento #16: registering an accountant and a fiscal reviewer never replaces the legal representative — all three stay vigente', async () => {
    const fresh = await actorWithRoles(['owner']);
    const legalRep = await register(
      fresh.token,
      'Representante Vigente',
      Buffer.from('firma rep').toString('base64'),
      'legal_representative',
    ).expect(201);
    const accountant = await register(
      fresh.token,
      'Contador Vigente',
      Buffer.from('firma contador').toString('base64'),
      'accountant',
    ).expect(201);
    const fiscalReviewer = await register(
      fresh.token,
      'Revisor Vigente',
      Buffer.from('firma revisor').toString('base64'),
      'fiscal_reviewer',
    ).expect(201);

    const current = await getCurrent(fresh.token).expect(200);
    expect(current.body).toHaveLength(3);
    const byRole = Object.fromEntries(
      current.body.map((r: { role: string; fullName: string; id: string }) => [r.role, r]),
    );
    expect(byRole.legal_representative).toMatchObject({
      id: legalRep.body.id,
      fullName: 'Representante Vigente',
    });
    expect(byRole.accountant).toMatchObject({
      id: accountant.body.id,
      fullName: 'Contador Vigente',
    });
    expect(byRole.fiscal_reviewer).toMatchObject({
      id: fiscalReviewer.body.id,
      fullName: 'Revisor Vigente',
    });

    // Re-registering the accountant replaces ONLY the accountant's vigente row.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newAccountant = await register(
      fresh.token,
      'Nuevo Contador',
      Buffer.from('firma nuevo contador').toString('base64'),
      'accountant',
    ).expect(201);

    const after = await getCurrent(fresh.token).expect(200);
    expect(after.body).toHaveLength(3);
    const afterByRole = Object.fromEntries(
      after.body.map((r: { role: string; fullName: string; id: string }) => [r.role, r]),
    );
    expect(afterByRole.accountant.id).toBe(newAccountant.body.id);
    expect(afterByRole.accountant.fullName).toBe('Nuevo Contador');
    // Legal representative and fiscal reviewer are untouched.
    expect(afterByRole.legal_representative.id).toBe(legalRep.body.id);
    expect(afterByRole.fiscal_reviewer.id).toBe(fiscalReviewer.body.id);
  });

  it('records an append-only audit entry with metadata only — never the signature content', async () => {
    const res = await register(owner.token, 'Auditado').expect(201);
    const auditRow = await admin.auditLog.findFirst({
      where: {
        organizationId: owner.orgId,
        action: 'organization.legal_representative_registered',
        entityId: res.body.id,
      },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow?.metadata).toMatchObject({
      role: 'legal_representative',
      fullName: 'Auditado',
      position: 'Representante legal',
    });
    expect(JSON.stringify(auditRow?.metadata)).not.toContain(SIGNATURE_BASE64);
  });

  it('is immutable at the DB level — a superuser UPDATE/DELETE is rejected by the trigger', async () => {
    const res = await register(owner.token, 'Inmutable').expect(201);
    await expect(
      admin.$executeRawUnsafe(
        `UPDATE legal_representatives SET full_name = 'tampered' WHERE id = $1::uuid`,
        res.body.id,
      ),
    ).rejects.toThrow(/append-only/i);
    await expect(
      admin.$executeRawUnsafe(`DELETE FROM legal_representatives WHERE id = $1::uuid`, res.body.id),
    ).rejects.toThrow(/append-only/i);
  });

  it('allows a ReadOnlyAuditor to read, but not to register (403)', async () => {
    const auditor = await actorWithRoles(['read_only_auditor']);
    await getCurrent(auditor.token).expect(200);
    await register(auditor.token).expect(403);
  });

  it('legal_representative_summary() — the narrow read M05 will consume — exposes ONLY fullName/position/signatureFileRef/signatureHash, and only the most recent record OF THE DEFAULT ROLE (legal_representative)', async () => {
    const fresh = await actorWithRoles(['owner']);
    const first = await register(
      fresh.token,
      'Representante Viejo',
      Buffer.from('firma vieja').toString('base64'),
    ).expect(201);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await register(
      fresh.token,
      'Representante Vigente',
      Buffer.from('firma nueva').toString('base64'),
    ).expect(201);

    const rows = await admin.$queryRawUnsafe<
      Array<{
        full_name: string;
        position: string;
        signature_file_ref: string;
        signature_hash: string;
      }>
    >('SELECT * FROM legal_representative_summary($1::uuid)', fresh.orgId);

    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(
      ['full_name', 'position', 'signature_file_ref', 'signature_hash'].sort(),
    );
    expect(rows[0].full_name).toBe('Representante Vigente');
    expect(rows[0].signature_hash).toBe(second.body.signatureHash);
    expect(rows[0].signature_hash).not.toBe(first.body.signatureHash);
  });

  it('legal_representative_summary() accepts an explicit p_role (requerimiento #16) and never mixes roles', async () => {
    const fresh = await actorWithRoles(['owner']);
    await register(
      fresh.token,
      'Representante Legal',
      Buffer.from('firma rep').toString('base64'),
      'legal_representative',
    ).expect(201);
    const accountant = await register(
      fresh.token,
      'Contador Vigente',
      Buffer.from('firma contador').toString('base64'),
      'accountant',
    ).expect(201);

    const rows = await admin.$queryRawUnsafe<Array<{ full_name: string; signature_hash: string }>>(
      'SELECT * FROM legal_representative_summary($1::uuid, $2::text)',
      fresh.orgId,
      'accountant',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].full_name).toBe('Contador Vigente');
    expect(rows[0].signature_hash).toBe(accountant.body.signatureHash);
  });

  it('legal_representative_summary() returns no rows for an organization with none registered yet', async () => {
    const empty = await registerOrg('Sin representante');
    const rows = await admin.$queryRawUnsafe<unknown[]>(
      'SELECT * FROM legal_representative_summary($1::uuid)',
      empty.orgId,
    );
    expect(rows).toHaveLength(0);
  });
});

import { randomUUID } from 'node:crypto';
import * as ExcelJS from 'exceljs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { BULK_IMPORT_HEADERS } from '../src/modules/animals/bulk-import.schemas';
import { purgeOrganizations } from './support/cleanup';

/**
 * S2-04B-1 (RF07): bulk import of animals from a real .xlsx file — the
 * template download, row-by-row validation (valid/invalid/mixed), the
 * organization_id-spoofing guard, the row-count ceiling, and the RBAC matrix
 * (Owner/Administrator/Operator import; Veterinarian/Volunteer/ReadOnlyAuditor/
 * Person do not — narrower than manual creation on purpose). Tests titled
 * "no-leak: …" are picked up by `pnpm test:rls` too.
 */
describe('Animals bulk import (S2-04B-1, RF07)', () => {
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
        email: `bulk-${randomUUID()}@test.local`,
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

  /** Build a real .xlsx buffer: header row (default template headers, or a
   *  caller-supplied set to test a spoofed extra column) + data rows. */
  async function buildXlsx(rows: unknown[][], headers: readonly string[] = BULK_IMPORT_HEADERS) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Animales');
    sheet.addRow([...headers]);
    rows.forEach((row) => sheet.addRow(row));
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer as unknown as ArrayBuffer);
  }

  const uploadXlsx = (token: string, buffer: Buffer) =>
    request(server)
      .post('/animals/bulk-import')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'animales.xlsx');

  // supertest does not parse binary bodies by default — collect the raw bytes
  // (same helper as storage.integration-spec.ts).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const binaryParser = (res: any, cb: (err: Error | null, body: Buffer) => void): void => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  };

  let owner: Actor;
  let orgB: Actor;
  let operator: Actor;
  let vet: Actor;
  let auditor: Actor;
  let volunteer: Actor;
  let person: Actor;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    owner = await registerOrg('Refugio Import A');
    orgB = await registerOrg('Refugio Import B');
    operator = await actorWithRoles(['operator']);
    vet = await actorWithRoles(['veterinarian']);
    auditor = await actorWithRoles(['read_only_auditor']);
    volunteer = await actorWithRoles(['volunteer']);

    const personRes = await request(server)
      .post('/auth/register/person')
      .send({ displayName: 'P', email: `bulk-person-${randomUUID()}@test.local`, password })
      .expect(201);
    person = {
      token: personRes.body.tokens.accessToken,
      orgId: personRes.body.user.organizationId,
      userId: personRes.body.user.id,
    };
    createdOrgIds.push(person.orgId);
    // No need to create a "Labrador Retriever" breed for `owner`'s org — every
    // new organization is auto-seeded with the S2-04A default catalog (which
    // already includes it), used below as a valid-breed row.
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('downloads a valid .xlsx template with the expected columns', async () => {
    const res = await request(server)
      .get('/animals/bulk-import/template')
      .set('Authorization', `Bearer ${owner.token}`)
      .buffer()
      .parse(binaryParser)
      .expect(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body as Buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    const headerRow = sheet.getRow(1).values as unknown[];
    expect(headerRow.filter(Boolean)).toEqual([...BULK_IMPORT_HEADERS]);
    // A second (example) row exists so the uploader sees the expected shape.
    expect(sheet.rowCount).toBeGreaterThanOrEqual(2);
  });

  it('creates every valid row and returns created = N', async () => {
    const buffer = await buildXlsx([
      [
        'Firulais',
        'Perro',
        'Labrador Retriever',
        'Macho',
        'Mediano',
        '2023-05-10',
        'Sociable',
        'Juguetón',
      ],
      ['Michu', 'Gato', '', 'Hembra', 'Pequeño', '', '', ''],
    ]);
    const res = await uploadXlsx(owner.token, buffer).expect(201);

    expect(res.body).toMatchObject({ totalRows: 2, created: 2, failed: 0, errors: [] });

    const list = await request(server)
      .get('/animals')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    const firulais = list.body.find((a: { name: string }) => a.name === 'Firulais');
    expect(firulais.breed).toBe('Labrador Retriever');
    expect(firulais.tags).toEqual(['Juguetón']);
    expect(list.body.some((a: { name: string }) => a.name === 'Michu')).toBe(true);
  });

  it('reports invalid rows (missing name, unknown species, unknown breed) without aborting the valid ones', async () => {
    const buffer = await buildXlsx([
      ['Rocco', 'Perro', '', 'Macho', 'Grande', '', '', ''], // valid
      ['', 'Perro', '', '', '', '', '', ''], // missing name
      ['Drako', 'Dragón', '', '', '', '', '', ''], // unknown species
      ['Nina', 'Gato', 'Raza Inexistente', '', '', '', '', ''], // unknown breed
    ]);
    const res = await uploadXlsx(owner.token, buffer).expect(201);

    expect(res.body.totalRows).toBe(4);
    expect(res.body.created).toBe(1);
    expect(res.body.failed).toBe(3);
    const rows = res.body.errors.map((e: { row: number }) => e.row);
    expect(rows).toEqual([3, 4, 5]); // header is row 1; data starts at row 2
    expect(res.body.errors[0]).toMatchObject({ field: 'Nombre' });
    expect(res.body.errors[1]).toMatchObject({ field: 'Especie' });
    expect(res.body.errors[2]).toMatchObject({ field: 'Raza' });
  });

  it('no-leak: ignores a spoofed "organization_id" column and keeps the animal in the uploader\'s own org', async () => {
    const headers = [...BULK_IMPORT_HEADERS, 'organization_id'] as const;
    const buffer = await buildXlsx(
      [['Spoofed', 'Perro', '', '', '', '', '', '', orgB.orgId]],
      headers,
    );
    const res = await uploadXlsx(owner.token, buffer).expect(201);
    expect(res.body.created).toBe(1);

    const mine = await request(server)
      .get('/animals')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(mine.body.some((a: { name: string }) => a.name === 'Spoofed')).toBe(true);

    // Never visible from Org B, no matter what the spreadsheet column said.
    const theirs = await request(server)
      .get('/animals')
      .set('Authorization', `Bearer ${orgB.token}`)
      .expect(200);
    expect(theirs.body.some((a: { name: string }) => a.name === 'Spoofed')).toBe(false);
  });

  it('rejects a file over the row-count ceiling (400, documents the limit)', async () => {
    const rows = Array.from({ length: 501 }, (_, i) => [
      `Animal ${i}`,
      'Perro',
      '',
      '',
      '',
      '',
      '',
      '',
    ]);
    const buffer = await buildXlsx(rows);
    const res = await uploadXlsx(owner.token, buffer).expect(400);
    expect(res.body.message).toMatch(/500/);
  });

  it('import RBAC: Owner ✓, Operator ✓, Veterinarian ✗, Volunteer ✗, ReadOnlyAuditor ✗, Person ✗', async () => {
    const buffer = await buildXlsx([['Bobby', 'Perro', '', '', '', '', '', '']]);
    await uploadXlsx(owner.token, buffer).expect(201);
    await uploadXlsx(operator.token, buffer).expect(201);
    await uploadXlsx(vet.token, buffer).expect(403);
    await uploadXlsx(volunteer.token, buffer).expect(403);
    await uploadXlsx(auditor.token, buffer).expect(403);
    await uploadXlsx(person.token, buffer).expect(403);
  });

  it('audits the import with actor, counts and timestamp — never the file content', async () => {
    const buffer = await buildXlsx([['Audit1', 'Perro', '', '', '', '', '', '']]);
    await uploadXlsx(owner.token, buffer).expect(201);

    const events = await admin.auditLog.findMany({
      where: { organizationId: owner.orgId, action: 'animal.bulk_import_completed' },
      orderBy: { createdAt: 'desc' },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
    const metadata = events[0].metadata as Record<string, unknown>;
    expect(metadata).toHaveProperty('totalRows');
    expect(metadata).toHaveProperty('created');
    expect(metadata).toHaveProperty('failed');
    expect(JSON.stringify(metadata)).not.toContain('Audit1');
  });
});

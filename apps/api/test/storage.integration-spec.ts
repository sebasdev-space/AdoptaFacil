import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import type { Env } from '../src/config/env.validation';
import { DiskStorageAdapter } from '../src/core/storage/disk-storage.adapter';
import { STORAGE_PORT } from '../src/core/storage/storage.port';
import { purgeOrganizations } from './support/cleanup';

/**
 * T-108 storage endpoints with the REAL disk adapter (bytes persisted to a temp
 * root). Private legal documents: only the owning org's Owner or a platform admin
 * download them (others 403, no session 401); public animal photos: anyone. Plus
 * path-traversal and content-type rejection on upload.
 */
describe('Storage (T-108: disk adapter, private vs public serving)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const createdOrgIds: string[] = [];
  const password = 'password123';
  const storageRoot = mkdtempSync(join(tmpdir(), 'adoptafacil-it-'));

  interface Actor {
    token: string;
    orgId: string;
    userId: string;
  }

  async function registerOrg(): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: 'Refugio',
        displayName: 'Owner',
        email: `t108-${randomUUID()}@test.local`,
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

  let ownerA: Actor;
  let ownerB: Actor;
  let platformAdmin: Actor;
  let docKey = '';
  let photoKey = '';
  const docBytes = Buffer.from('%PDF-1.4 fake legal document bytes');
  const photoBytes = Buffer.from('\x89PNG fake photo bytes');

  const upload = (
    token: string,
    key: string,
    bytes: Buffer,
    filename: string,
    contentType: string,
  ) =>
    request(server)
      .put(`/storage/upload?key=${encodeURIComponent(key)}`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', bytes, { filename, contentType });

  // supertest does not parse binary bodies by default — collect the raw bytes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const binaryParser = (res: any, cb: (err: Error | null, body: Buffer) => void): void => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  };

  beforeAll(async () => {
    const diskConfig = {
      get: (key: string) =>
        (
          ({
            STORAGE_DISK_ROOT: storageRoot,
            STORAGE_MAX_FILE_MB: 15,
            STORAGE_PUBLIC_BASE_URL: 'http://localhost:3000',
          }) as Record<string, unknown>
        )[key],
    } as unknown as ConfigService<Env, true>;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STORAGE_PORT)
      .useValue(new DiskStorageAdapter(diskConfig))
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    ownerA = await registerOrg();
    ownerB = await registerOrg();
    platformAdmin = await registerOrg();
    await admin.userRole.create({
      data: {
        organizationId: platformAdmin.orgId,
        userId: platformAdmin.userId,
        role: 'platform_admin',
      },
    });

    // Reserve a PRIVATE legal document for org A (Owner/Administrator).
    const doc = await request(server)
      .post('/org/documents')
      .set('Authorization', `Bearer ${ownerA.token}`)
      .send({ type: 'rut', filename: 'demanda.pdf' })
      .expect(201);
    docKey = doc.body.upload.key;
    expect(docKey.startsWith(`private/${ownerA.orgId}/`)).toBe(true);

    // Reserve a PUBLIC animal photo for org A.
    const animal = await request(server)
      .post('/animals')
      .set('Authorization', `Bearer ${ownerA.token}`)
      .send({
        name: 'Firu',
        species: 'dog',
        sex: 'male',
        size: 'medium',
        photos: [{ filename: 'firu.png' }],
      })
      .expect(201);
    photoKey = animal.body.photoRecords[0].storageRef;
    expect(photoKey.startsWith(`public/${ownerA.orgId}/`)).toBe(true);
  });

  afterAll(async () => {
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
    rmSync(storageRoot, { recursive: true, force: true });
  });

  it('persists real bytes and serves an identical private document to its Owner', async () => {
    await upload(ownerA.token, docKey, docBytes, 'demanda.pdf', 'application/pdf').expect(200);

    const res = await request(server)
      .get(`/storage/private?key=${encodeURIComponent(docKey)}`)
      .set('Authorization', `Bearer ${ownerA.token}`)
      .buffer()
      .parse(binaryParser)
      .expect(200);
    expect((res.body as Buffer).equals(docBytes)).toBe(true);
    expect(res.headers['content-type']).toContain('application/pdf');
  });

  it('lets a PlatformAdmin download the private document, but blocks another org (403) and anonymous (401)', async () => {
    await request(server)
      .get(`/storage/private?key=${encodeURIComponent(docKey)}`)
      .set('Authorization', `Bearer ${platformAdmin.token}`)
      .expect(200);
    await request(server)
      .get(`/storage/private?key=${encodeURIComponent(docKey)}`)
      .set('Authorization', `Bearer ${ownerB.token}`)
      .expect(403);
    await request(server)
      .get(`/storage/private?key=${encodeURIComponent(docKey)}`)
      .expect(401);
  });

  it('audits private-document downloads (UTC), without content', async () => {
    const events = await admin.auditLog.findMany({
      where: { organizationId: ownerA.orgId, action: 'storage.document_downloaded' },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(events[0].metadata)).not.toContain('PDF');
  });

  it('serves a public animal photo to anyone (no session)', async () => {
    await upload(ownerA.token, photoKey, photoBytes, 'firu.png', 'image/png').expect(200);
    const res = await request(server)
      .get(`/storage/public?key=${encodeURIComponent(photoKey)}`)
      .buffer()
      .parse(binaryParser)
      .expect(200);
    expect((res.body as Buffer).equals(photoBytes)).toBe(true);
  });

  it('does not serve a private document through the public endpoint (404)', async () => {
    await request(server)
      .get(`/storage/public?key=${encodeURIComponent(docKey)}`)
      .expect(404);
  });

  it('rejects path traversal, foreign-org upload and disallowed content types', async () => {
    // Path traversal key → invalid key.
    await request(server)
      .put(`/storage/upload?key=${encodeURIComponent('../../etc/passwd')}`)
      .set('Authorization', `Bearer ${ownerA.token}`)
      .attach('file', docBytes, { filename: 'x', contentType: 'application/pdf' })
      .expect(400);
    // Uploading to another org's key → forbidden.
    await upload(ownerB.token, docKey, docBytes, 'demanda.pdf', 'application/pdf').expect(403);
    // Disallowed content type → rejected.
    await upload(ownerA.token, photoKey, Buffer.from('hi'), 'note.txt', 'text/plain').expect(400);
  });
});

import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * S-15 (pedido del cliente, 2026-10-05): el PlatformAdmin puede subir hasta 4
 * fotos para el banner del portal general ("/"), reemplazando el collage
 * decorativo de íconos fijos. `platform_settings` es un SINGLETON global (no
 * tenant data) — este spec pin/resetea `heroBannerPhotos` a vacío antes y
 * después, igual que `organization-type.integration-spec.ts` ya hace con
 * `showOrganizationType` sobre la MISMA fila.
 */
describe('Platform hero banner photos (T-030, S-15)', () => {
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

  async function registerOrg(): Promise<Actor> {
    const res = await request(server)
      .post('/auth/register/organization')
      .send({
        organizationName: 'Refugio S15',
        displayName: 'Owner',
        email: `s15-${randomUUID()}@test.local`,
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

  const createUpload = (token: string, filename = 'banner.jpg') =>
    request(server)
      .post('/platform/settings/uploads')
      .set('Authorization', `Bearer ${token}`)
      .send({ filename, contentType: 'image/jpeg' });

  const putSettings = (token: string, body: Record<string, unknown>) =>
    request(server).put('/platform/settings').set('Authorization', `Bearer ${token}`).send(body);

  const getSettings = (token: string) =>
    request(server).get('/platform/settings').set('Authorization', `Bearer ${token}`);

  const getPublicBanner = () => request(server).get('/public/hero-banner');

  let platformAdmin: Actor;
  let owner: Actor;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    await admin.platformSettings.upsert({
      where: { id: 'global' },
      create: { id: 'global', showOrganizationType: 'formalized_only', heroBannerPhotos: [] },
      update: { heroBannerPhotos: [] },
    });

    const pa = await registerOrg();
    await admin.userRole.create({
      data: { organizationId: pa.orgId, userId: pa.userId, role: 'platform_admin' },
    });
    platformAdmin = pa;
    owner = await registerOrg();
  });

  afterAll(async () => {
    await admin.platformSettings.update({
      where: { id: 'global' },
      data: { heroBannerPhotos: [] },
    });
    await purgeOrganizations(admin, createdOrgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('starts empty — the public banner endpoint returns no photos before any upload', async () => {
    const res = await getPublicBanner().expect(200);
    expect(res.body).toEqual({ photos: [] });
  });

  it('reserves an upload target scoped to the acting PlatformAdmin (PUT /storage/upload would accept it)', async () => {
    const reserved = await createUpload(platformAdmin.token).expect(201);
    expect(reserved.body.key).toContain(platformAdmin.orgId);
    expect(reserved.body.url).toBeDefined();
  });

  it('a non-platform role cannot reserve an upload target (403)', async () => {
    await createUpload(owner.token).expect(403);
  });

  it('PlatformAdmin sets up to 4 banner photos; the public endpoint reflects them immediately', async () => {
    const photos = [
      'http://localhost:3000/storage/public?key=public/org-1/a.jpg',
      'http://localhost:3000/storage/public?key=public/org-1/b.jpg',
    ];
    const updated = await putSettings(platformAdmin.token, {
      showOrganizationType: 'formalized_only',
      heroBannerPhotos: photos,
    }).expect(200);
    expect(updated.body.heroBannerPhotos).toEqual(photos);

    const read = await getSettings(platformAdmin.token).expect(200);
    expect(read.body.heroBannerPhotos).toEqual(photos);

    const publicRead = await getPublicBanner().expect(200);
    expect(publicRead.body).toEqual({ photos });
  });

  it('omitting heroBannerPhotos on a later update NEVER clears the banner (additive contract)', async () => {
    await putSettings(platformAdmin.token, { showOrganizationType: 'all' }).expect(200);

    const read = await getSettings(platformAdmin.token).expect(200);
    expect(read.body.showOrganizationType).toBe('all');
    expect(read.body.heroBannerPhotos).toHaveLength(2); // untouched from the previous test

    // Restore the policy default for any test file running after this one.
    await putSettings(platformAdmin.token, { showOrganizationType: 'formalized_only' }).expect(200);
  });

  it('rejects a 5th photo (max 4)', async () => {
    const fivePhotos = Array.from({ length: 5 }, (_, i) => `http://localhost:3000/img-${i}.jpg`);
    await putSettings(platformAdmin.token, {
      showOrganizationType: 'formalized_only',
      heroBannerPhotos: fivePhotos,
    }).expect(400);
  });

  it('a non-platform role cannot change the banner (403)', async () => {
    await putSettings(owner.token, {
      showOrganizationType: 'formalized_only',
      heroBannerPhotos: ['http://localhost:3000/x.jpg'],
    }).expect(403);
  });
});

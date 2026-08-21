import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { purgeOrganizations } from './support/cleanup';

/**
 * M10 (F-7, Ola 3) — marketplace simplificado: catálogo de productos por
 * organización, contacto por WhatsApp (fuera de la plataforma), sin carrito
 * ni checkout. Verifica RBAC en cada endpoint (deny-by-default), reglas de
 * negocio (precio > 0, stock >= 0, sin duplicados por nombre+organización),
 * el ciclo de vida (activo/inactivo), imágenes y el catálogo público con
 * filtro por categoría/organización. La no-filtración cross-organización
 * vive en `rls-no-leak-marketplace.integration-spec.ts`.
 */
describe('Marketplace (M10, F-7: products, RBAC, business rules, public catalog)', () => {
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
        email: `mkt-${tag}-${randomUUID()}@test.local`,
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

  const createProduct = (token: string, body: Record<string, unknown> = {}) =>
    request(server)
      .post('/marketplace/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Concentrado Premium 10kg',
        category: 'food',
        price: 85000,
        ...body,
      });

  let org: Actor;
  let orgB: Actor;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    org = await registerOrg('org');
    orgB = await registerOrg('orgb');
  });

  afterAll(async () => {
    await purgeOrganizations(admin, orgIds);
    await admin.$disconnect();
    await app?.close();
  });

  it('RBAC: no token → 401', async () => {
    await request(server).post('/marketplace/products').send({}).expect(401);
  });

  it('RBAC: only Owner/Administrator/Operator may publish a product (ReadOnlyAuditor → 403)', async () => {
    const auditor = await actorWithRoles('auditor', ['read_only_auditor']);
    await createProduct(auditor.token).expect(403);
  });

  it('rejects a price that is not a positive integer', async () => {
    await createProduct(org.token, { price: 0 }).expect(400);
    await createProduct(org.token, { price: -100 }).expect(400);
    await createProduct(org.token, { price: 100.5 }).expect(400);
  });

  it('rejects a negative stock', async () => {
    await createProduct(org.token, { stock: -1 }).expect(400);
  });

  let productId = '';

  it('publishes a product (Owner) — active, images empty by default', async () => {
    const res = await createProduct(org.token).expect(201);
    productId = res.body.id;
    expect(res.body).toMatchObject({
      organizationId: org.orgId,
      name: 'Concentrado Premium 10kg',
      category: 'food',
      price: 85000,
      stock: 0,
      isActive: true,
      images: [],
    });
  });

  it('rejects a second product with the SAME name in the SAME organization (409)', async () => {
    await createProduct(org.token).expect(409);
  });

  it('allows the SAME name in a DIFFERENT organization', async () => {
    await createProduct(orgB.token).expect(201);
  });

  it('the product appears in the org list, and in the PUBLIC catalog + detail', async () => {
    const list = await request(server)
      .get('/marketplace/products')
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    expect(list.body.items.some((p: { id: string }) => p.id === productId)).toBe(true);

    const publicList = await request(server).get('/public/marketplace/products').expect(200);
    expect(publicList.body.items.some((p: { id: string }) => p.id === productId)).toBe(true);

    const publicDetail = await request(server)
      .get(`/public/marketplace/products/${productId}`)
      .expect(200);
    expect(publicDetail.body).toMatchObject({ id: productId, organizationId: org.orgId });
  });

  it('the public catalog filters by category and by organization', async () => {
    const byCategory = await request(server)
      .get('/public/marketplace/products?category=food')
      .expect(200);
    expect(byCategory.body.items.every((p: { category: string }) => p.category === 'food')).toBe(
      true,
    );

    const byOrg = await request(server)
      .get(`/public/marketplace/products?organizationId=${org.orgId}`)
      .expect(200);
    expect(
      byOrg.body.items.every((p: { organizationId: string }) => p.organizationId === org.orgId),
    ).toBe(true);
    expect(byOrg.body.items.some((p: { id: string }) => p.id === productId)).toBe(true);
  });

  it('a public 404 for an unknown product id', async () => {
    await request(server).get(`/public/marketplace/products/${randomUUID()}`).expect(404);
  });

  it('updates the product; renaming to a colliding name in the same org → 409', async () => {
    const updated = await request(server)
      .patch(`/marketplace/products/${productId}`)
      .set('Authorization', `Bearer ${org.token}`)
      .send({ price: 90000, stock: 10 })
      .expect(200);
    expect(updated.body).toMatchObject({ price: 90000, stock: 10 });

    const other = await createProduct(org.token, { name: 'Otro producto' }).expect(201);
    await request(server)
      .patch(`/marketplace/products/${other.body.id}`)
      .set('Authorization', `Bearer ${org.token}`)
      .send({ name: 'Concentrado Premium 10kg' })
      .expect(409);
  });

  it('deactivating a product hides it from the default org list and the public catalog', async () => {
    await request(server)
      .patch(`/marketplace/products/${productId}`)
      .set('Authorization', `Bearer ${org.token}`)
      .send({ isActive: false })
      .expect(200);

    const list = await request(server)
      .get('/marketplace/products')
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    expect(list.body.items.some((p: { id: string }) => p.id === productId)).toBe(false);

    const withInactive = await request(server)
      .get('/marketplace/products?includeInactive=true')
      .set('Authorization', `Bearer ${org.token}`)
      .expect(200);
    expect(withInactive.body.items.some((p: { id: string }) => p.id === productId)).toBe(true);

    const publicList = await request(server).get('/public/marketplace/products').expect(200);
    expect(publicList.body.items.some((p: { id: string }) => p.id === productId)).toBe(false);

    await request(server).get(`/public/marketplace/products/${productId}`).expect(404);
  });

  it('reactivating restores public visibility', async () => {
    await request(server)
      .patch(`/marketplace/products/${productId}`)
      .set('Authorization', `Bearer ${org.token}`)
      .send({ isActive: true })
      .expect(200);
    await request(server).get(`/public/marketplace/products/${productId}`).expect(200);
  });

  let imageId = '';

  it('RBAC: only write roles may add a product image', async () => {
    const auditor = await actorWithRoles('img-auditor', ['read_only_auditor']);
    await request(server)
      .post(`/marketplace/products/${productId}/images`)
      .set('Authorization', `Bearer ${auditor.token}`)
      .send({ filename: 'foto.jpg' })
      .expect(403);
  });

  it('adds a product image and it is resolvable publicly', async () => {
    const res = await request(server)
      .post(`/marketplace/products/${productId}/images`)
      .set('Authorization', `Bearer ${org.token}`)
      .send({ filename: 'foto.jpg', contentType: 'image/jpeg' })
      .expect(201);
    imageId = res.body.image.id;
    expect(res.body.image).toMatchObject({ order: 0 });
    expect(res.body.upload).toHaveProperty('key');

    const publicDetail = await request(server)
      .get(`/public/marketplace/products/${productId}`)
      .expect(200);
    expect(publicDetail.body.images).toHaveLength(1);
    expect(publicDetail.body.images[0]).toMatchObject({ id: imageId });
  });

  it('removes a product image', async () => {
    await request(server)
      .delete(`/marketplace/products/${productId}/images/${imageId}`)
      .set('Authorization', `Bearer ${org.token}`)
      .expect(204);

    const publicDetail = await request(server)
      .get(`/public/marketplace/products/${productId}`)
      .expect(200);
    expect(publicDetail.body.images).toHaveLength(0);
  });

  it('a product from a DIFFERENT org cannot be read/edited (404, tenant-scoped read)', async () => {
    await request(server)
      .get(`/marketplace/products/${productId}`)
      .set('Authorization', `Bearer ${orgB.token}`)
      .expect(404);
  });
});

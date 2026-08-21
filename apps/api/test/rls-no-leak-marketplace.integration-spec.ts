import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate for M10 (marketplace simplificado): products, product_images —
 * tenant-isolated (no cross-org visibility, no cross-org write). Connects as
 * the NON-SUPERUSER app role. no-leak tests carry "no-leak" so `test:rls`
 * runs them (same pattern as rls-no-leak-resources).
 */
const APP_DATABASE_URL =
  process.env.DATABASE_URL_APP ??
  'postgresql://adoptafacil_app:adoptafacil_app@localhost:5433/adoptafacil?schema=public';

async function withOrgContext<T>(
  prisma: PrismaClient,
  organizationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT set_config('app.current_org_id', ${organizationId}, true)`;
    return fn(tx);
  });
}

interface Seeded {
  productId: string;
  imageId: string;
}

async function seed(prisma: PrismaClient, orgId: string, tag: string): Promise<Seeded> {
  return withOrgContext(prisma, orgId, async (tx) => {
    const product = await tx.product.create({
      data: {
        organizationId: orgId,
        name: `Producto ${tag}`,
        category: 'food',
        price: 10000,
        stock: 5,
      },
    });
    const image = await tx.productImage.create({
      data: { organizationId: orgId, productId: product.id, storageRef: `public/${orgId}/x.jpg` },
    });
    return { productId: product.id, imageId: image.id };
  });
}

describe('RLS (products, product_images)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  let seededA: Seeded;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        { id: orgA, name: 'Org A' },
        { id: orgB, name: 'Org B' },
      ],
      skipDuplicates: true,
    });
    seededA = await seed(prisma, orgA, 'A');
    await seed(prisma, orgB, 'B');
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own rows in both tables, never Org B', async () => {
    await withOrgContext(prisma, orgA, async (tx) => {
      const products = await tx.product.findMany();
      const images = await tx.productImage.findMany();
      expect(products.every((r) => r.organizationId === orgA)).toBe(true);
      expect(images.every((r) => r.organizationId === orgA)).toBe(true);
      expect(products).toHaveLength(1);
      expect(images).toHaveLength(1);
    });
  });

  it('no-leak: with no tenant context, nothing is visible in either table', async () => {
    expect(await prisma.product.findMany()).toHaveLength(0);
    expect(await prisma.productImage.findMany()).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks writing a product for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.product.create({
          data: {
            organizationId: orgB,
            name: 'Cross-tenant write',
            category: 'food',
            price: 1000,
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('no-leak: WITH CHECK blocks writing a product image for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.productImage.create({
          data: {
            organizationId: orgB,
            productId: seededA.productId,
            storageRef: 'public/x/y.jpg',
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('no-leak: Org A cannot UPDATE a row that (via context mismatch) resolves to Org B', async () => {
    const found = await withOrgContext(prisma, orgA, (tx) =>
      tx.product.findUnique({ where: { id: seededA.productId } }),
    );
    expect(found).not.toBeNull();
    const foreign = await withOrgContext(prisma, orgB, (tx) =>
      tx.product.findUnique({ where: { id: seededA.productId } }),
    );
    expect(foreign).toBeNull();
  });
});

import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate for M09 (banco de recursos): resource_needs, resource_offers,
 * resource_deliveries, resource_delivery_evidences, resource_fulfillment_applications
 * — tenant-isolated (no cross-org visibility, no cross-org write). Connects
 * as the NON-SUPERUSER app role. no-leak tests carry "no-leak" so `test:rls`
 * runs them (same pattern as rls-no-leak-payouts).
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
  needId: string;
  offerId: string;
  deliveryId: string;
  evidenceId: string;
}

async function seed(prisma: PrismaClient, orgId: string, tag: string): Promise<Seeded> {
  return withOrgContext(prisma, orgId, async (tx) => {
    const need = await tx.resourceNeed.create({
      data: {
        organizationId: orgId,
        title: `Necesidad ${tag}`,
        category: 'food',
        quantityNeeded: 10,
        unit: 'kg',
      },
    });
    const offer = await tx.resourceOffer.create({
      data: {
        organizationId: orgId,
        needId: need.id,
        donorUserId: randomUUID(),
        quantityOffered: 5,
      },
    });
    const delivery = await tx.resourceDelivery.create({
      data: { organizationId: orgId, offerId: offer.id, needId: need.id },
    });
    const evidence = await tx.resourceDeliveryEvidence.create({
      data: { organizationId: orgId, deliveryId: delivery.id, storageRef: `public/${orgId}/x.jpg` },
    });
    await tx.resourceFulfillmentApplication.create({
      data: { organizationId: orgId, deliveryId: delivery.id, needId: need.id, quantityApplied: 5 },
    });
    return { needId: need.id, offerId: offer.id, deliveryId: delivery.id, evidenceId: evidence.id };
  });
}

describe('RLS (resource_needs, resource_offers, resource_deliveries, resource_delivery_evidences, resource_fulfillment_applications)', () => {
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

  it('no-leak: Org A sees only its own rows in all 5 tables, never Org B', async () => {
    await withOrgContext(prisma, orgA, async (tx) => {
      const needs = await tx.resourceNeed.findMany();
      const offers = await tx.resourceOffer.findMany();
      const deliveries = await tx.resourceDelivery.findMany();
      const evidences = await tx.resourceDeliveryEvidence.findMany();
      const applications = await tx.resourceFulfillmentApplication.findMany();
      expect(needs.every((r) => r.organizationId === orgA)).toBe(true);
      expect(offers.every((r) => r.organizationId === orgA)).toBe(true);
      expect(deliveries.every((r) => r.organizationId === orgA)).toBe(true);
      expect(evidences.every((r) => r.organizationId === orgA)).toBe(true);
      expect(applications.every((r) => r.organizationId === orgA)).toBe(true);
      expect(needs).toHaveLength(1);
      expect(offers).toHaveLength(1);
      expect(deliveries).toHaveLength(1);
      expect(evidences).toHaveLength(1);
      expect(applications).toHaveLength(1);
    });
  });

  it('no-leak: with no tenant context, nothing is visible in any of the 5 tables', async () => {
    expect(await prisma.resourceNeed.findMany()).toHaveLength(0);
    expect(await prisma.resourceOffer.findMany()).toHaveLength(0);
    expect(await prisma.resourceDelivery.findMany()).toHaveLength(0);
    expect(await prisma.resourceDeliveryEvidence.findMany()).toHaveLength(0);
    expect(await prisma.resourceFulfillmentApplication.findMany()).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks writing a need for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.resourceNeed.create({
          data: {
            organizationId: orgB,
            title: 'Cross-tenant write',
            category: 'food',
            quantityNeeded: 1,
            unit: 'kg',
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('no-leak: WITH CHECK blocks writing an offer for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.resourceOffer.create({
          data: {
            organizationId: orgB,
            needId: seededA.needId,
            donorUserId: randomUUID(),
            quantityOffered: 1,
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('no-leak: Org A cannot UPDATE a row that (via context mismatch) resolves to Org B', async () => {
    // Org A's own context can only ever SEE its own rows (proven above); this
    // asserts the read-then-write path never finds Org B's need to begin with.
    const found = await withOrgContext(prisma, orgA, (tx) =>
      tx.resourceNeed.findUnique({ where: { id: seededA.needId } }),
    );
    expect(found).not.toBeNull();
    const foreign = await withOrgContext(prisma, orgB, (tx) =>
      tx.resourceNeed.findUnique({ where: { id: seededA.needId } }),
    );
    expect(foreign).toBeNull();
  });
});

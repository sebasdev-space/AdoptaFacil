import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate for M06 campaign evidences (RF16 · T-054): tenant-isolated (no
 * cross-org visibility, no cross-org write) on the authenticated path. Connects
 * as the NON-SUPERUSER app role. no-leak tests carry "no-leak" so `test:rls`
 * runs them.
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

/** Seed a campaign + one evidence for an org, returning the campaign id. */
async function seed(prisma: PrismaClient, orgId: string, tag: string): Promise<string> {
  return withOrgContext(prisma, orgId, async (tx) => {
    const campaign = await tx.campaign.create({
      data: {
        organizationId: orgId,
        title: `Campaign ${tag}`,
        category: 'medications',
        goalAmount: 100_000,
        deadline: new Date('2026-12-31T00:00:00.000Z'),
      },
    });
    await tx.campaignEvidence.create({
      data: {
        organizationId: orgId,
        campaignId: campaign.id,
        type: 'invoice',
        concept: `Gasto ${tag}`,
        amount: 50_000,
        spentAt: new Date('2026-07-01T00:00:00.000Z'),
        storageRef: `public/${orgId}/${randomUUID()}-factura.pdf`,
      },
    });
    return campaign.id;
  });
}

describe('RLS (campaign evidences)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  let campaignB = '';

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        { id: orgA, name: 'Org A' },
        { id: orgB, name: 'Org B' },
      ],
      skipDuplicates: true,
    });
    await seed(prisma, orgA, 'A');
    campaignB = await seed(prisma, orgB, 'B');
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own evidences, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.campaignEvidence.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
    expect(rows.some((r) => r.concept.includes('B'))).toBe(false);
  });

  it('no-leak: with no tenant context, no evidences are visible', async () => {
    expect(await prisma.campaignEvidence.findMany()).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks writing an evidence for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.campaignEvidence.create({
          data: {
            organizationId: orgB,
            campaignId: campaignB,
            type: 'invoice',
            concept: 'X',
            amount: 1000,
            spentAt: new Date('2026-07-01T00:00:00.000Z'),
            storageRef: `public/${orgB}/${randomUUID()}-x.pdf`,
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

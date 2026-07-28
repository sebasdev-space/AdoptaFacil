import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate for the M06 funding ledger (RF15 · T-055): tenant-isolated (no
 * cross-org visibility) and least-privilege (the app role cannot write the ledger
 * at all — only the bounded SECURITY DEFINER functions do). Connects as the
 * NON-SUPERUSER app role. no-leak tests carry "no-leak" so `test:rls` runs them.
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

/** Seed a campaign + one funding-ledger row for an org (admin bypasses RLS). */
async function seed(admin: PrismaClient, orgId: string, tag: string): Promise<void> {
  const campaign = await admin.campaign.create({
    data: {
      organizationId: orgId,
      title: `Campaign ${tag}`,
      category: 'medications',
      goalAmount: 100_000,
      deadline: new Date('2026-12-31T00:00:00.000Z'),
    },
  });
  await admin.campaignFundingApplication.create({
    data: {
      organizationId: orgId,
      campaignId: campaign.id,
      collectionId: `col-${tag}-${randomUUID()}`,
      net: 50_000,
    },
  });
}

describe('RLS (campaign funding ledger)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();

  beforeAll(async () => {
    await prisma.$connect();
    await admin.organization.createMany({
      data: [
        { id: orgA, name: 'Org A' },
        { id: orgB, name: 'Org B' },
      ],
      skipDuplicates: true,
    });
    await seed(admin, orgA, 'A');
    await seed(admin, orgB, 'B');
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own funding rows, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) =>
      tx.campaignFundingApplication.findMany(),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('no-leak: with no tenant context, no funding rows are visible', async () => {
    expect(await prisma.campaignFundingApplication.findMany()).toHaveLength(0);
  });

  it('least-privilege: the app role cannot write the ledger directly (only DEFINER functions do)', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.campaignFundingApplication.create({
          data: {
            organizationId: orgA,
            campaignId: randomUUID(),
            collectionId: `direct-${randomUUID()}`,
            net: 1,
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

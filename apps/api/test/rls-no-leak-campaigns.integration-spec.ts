import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate for M06 campaigns: tenant-isolated (no cross-org visibility, no
 * cross-org write) on the authenticated path. Connects as the NON-SUPERUSER app
 * role. no-leak tests carry "no-leak" so `test:rls` runs them.
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

async function seed(prisma: PrismaClient, orgId: string, tag: string): Promise<void> {
  await withOrgContext(prisma, orgId, (tx) =>
    tx.campaign.create({
      data: {
        organizationId: orgId,
        title: `Campaign ${tag}`,
        category: 'medications',
        goalAmount: 100_000,
        deadline: new Date('2026-12-31T00:00:00.000Z'),
      },
    }),
  );
}

describe('RLS (campaigns)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();

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
    await seed(prisma, orgB, 'B');
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own campaigns, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.campaign.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
    expect(rows.some((r) => r.title.includes('B'))).toBe(false);
  });

  it('no-leak: with no tenant context, no campaigns are visible', async () => {
    expect(await prisma.campaign.findMany()).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks writing a campaign for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.campaign.create({
          data: {
            organizationId: orgB,
            title: 'X',
            category: 'food',
            goalAmount: 1000,
            deadline: new Date('2026-12-31T00:00:00.000Z'),
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

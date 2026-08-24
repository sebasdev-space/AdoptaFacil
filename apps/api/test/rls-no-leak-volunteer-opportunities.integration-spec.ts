import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate for M08 volunteer opportunities (RF18 · S-6): tenant-isolated
 * (no cross-org visibility, no cross-org write) on the authenticated path.
 * Connects as the NON-SUPERUSER app role. Every test name contains "no-leak"
 * so the `test:rls` gate (-t "no-leak") runs it.
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

describe('RLS cross-org no-leak (volunteer_opportunities)', () => {
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

    await withOrgContext(prisma, orgA, (tx) =>
      tx.volunteerOpportunity.create({
        data: {
          organizationId: orgA,
          title: 'Oportunidad A',
          category: 'sterilizations',
          startDate: new Date('2026-09-01T00:00:00.000Z'),
          endDate: new Date('2026-09-30T00:00:00.000Z'),
          location: 'Refugio A',
        },
      }),
    );
    await withOrgContext(prisma, orgB, (tx) =>
      tx.volunteerOpportunity.create({
        data: {
          organizationId: orgB,
          title: 'Oportunidad B',
          category: 'food',
          startDate: new Date('2026-09-01T00:00:00.000Z'),
          endDate: new Date('2026-09-30T00:00:00.000Z'),
          location: 'Refugio B',
        },
      }),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own opportunities, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.volunteerOpportunity.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
    expect(rows.some((r) => r.title === 'Oportunidad B')).toBe(false);
  });

  it('no-leak: Org B sees only its own opportunities, never Org A (inverse)', async () => {
    const rows = await withOrgContext(prisma, orgB, (tx) => tx.volunteerOpportunity.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgB)).toBe(true);
    expect(rows.some((r) => r.title === 'Oportunidad A')).toBe(false);
  });

  it('no-leak: with no tenant context, no opportunities are visible', async () => {
    expect(await prisma.volunteerOpportunity.findMany()).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks creating an opportunity for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.volunteerOpportunity.create({
          data: {
            organizationId: orgB,
            title: 'Intruso',
            category: 'food',
            startDate: new Date('2026-09-01T00:00:00.000Z'),
            endDate: new Date('2026-09-30T00:00:00.000Z'),
            location: 'X',
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

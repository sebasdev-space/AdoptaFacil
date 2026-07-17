import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * RNF03 gate extended to a REAL business table (`org_members`), not just the
 * `_rls_probe` harness. Same guarantees, on data a module actually owns:
 *   - Org A only ever sees Org A's members, and Org B only Org B's (both ways).
 *   - With no tenant context, business rows are invisible (zero rows).
 *   - The policy's WITH CHECK blocks writing a row for a different org than the
 *     active context.
 *
 * Connects as the NON-SUPERUSER `adoptafacil_app` role — superusers bypass RLS.
 * Every test name contains "no-leak" so the `test:rls` gate (-t "no-leak") runs
 * the whole suite.
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

describe('RLS cross-org no-leak (org_members business table)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();

  beforeAll(async () => {
    await prisma.$connect();

    // organizations is the global registry (no RLS) — seed both tenants.
    await prisma.organization.createMany({
      data: [
        { id: orgA, name: 'Org A' },
        { id: orgB, name: 'Org B' },
      ],
      skipDuplicates: true,
    });

    // Seed one member per tenant, each inside its own context so WITH CHECK passes.
    await withOrgContext(prisma, orgA, (tx) =>
      tx.orgMember.create({
        data: {
          organizationId: orgA,
          email: 'alice@org-a.test',
          displayName: 'Alice',
          role: 'owner',
        },
      }),
    );
    await withOrgContext(prisma, orgB, (tx) =>
      tx.orgMember.create({
        data: { organizationId: orgB, email: 'bob@org-b.test', displayName: 'Bob', role: 'owner' },
      }),
    );
  });

  afterAll(async () => {
    await withOrgContext(prisma, orgA, (tx) => tx.orgMember.deleteMany({}));
    await withOrgContext(prisma, orgB, (tx) => tx.orgMember.deleteMany({}));
    await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await prisma.$disconnect();
  });

  it('no-leak: Org A sees only its own members, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.orgMember.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgA)).toBe(true);
    expect(rows.some((row) => row.email === 'bob@org-b.test')).toBe(false);
  });

  it('no-leak: Org B sees only its own members, never Org A (inverse)', async () => {
    const rows = await withOrgContext(prisma, orgB, (tx) => tx.orgMember.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgB)).toBe(true);
    expect(rows.some((row) => row.email === 'alice@org-a.test')).toBe(false);
  });

  it('no-leak: with no tenant context, no business rows are visible', async () => {
    const rows = await prisma.orgMember.findMany();
    expect(rows).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks writing a row for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.orgMember.create({
          data: {
            organizationId: orgB,
            email: 'mallory@org-b.test',
            displayName: 'Mallory',
            role: 'member',
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

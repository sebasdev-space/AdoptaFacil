import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * RNF03 gate — cross-organization no-leak harness over the canonical `_rls_probe`
 * table. This is the SEED test every module owner replicates for their own
 * tenant-scoped tables.
 *
 * IMPORTANT: it connects as a NON-SUPERUSER application role, because Postgres
 * superusers (and, without FORCE, table owners) bypass Row-Level Security.
 * The role and the RLS policy are created by the dedicated RLS migration.
 */
const APP_DATABASE_URL =
  process.env.DATABASE_URL_APP ??
  'postgresql://adoptafacil_app:adoptafacil_app@localhost:5433/adoptafacil?schema=public';

type ProbeRow = { organization_id: string; payload: string };

/** Run a callback inside a transaction scoped to one organization via RLS GUC. */
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

describe('RLS cross-org no-leak (_rls_probe)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();

  beforeAll(async () => {
    await prisma.$connect();

    // organizations is the global tenant registry (no RLS) — seed both orgs.
    await prisma.organization.createMany({
      data: [
        { id: orgA, name: 'Org A' },
        { id: orgB, name: 'Org B' },
      ],
      skipDuplicates: true,
    });

    // Seed one probe row per tenant, each inside its own org context so the
    // policy's WITH CHECK clause accepts the insert.
    await withOrgContext(
      prisma,
      orgA,
      (tx) =>
        tx.$executeRaw`INSERT INTO "_rls_probe" ("id", "organization_id", "payload")
        VALUES (${randomUUID()}::uuid, ${orgA}::uuid, 'secret-A')`,
    );
    await withOrgContext(
      prisma,
      orgB,
      (tx) =>
        tx.$executeRaw`INSERT INTO "_rls_probe" ("id", "organization_id", "payload")
        VALUES (${randomUUID()}::uuid, ${orgB}::uuid, 'secret-B')`,
    );
  });

  afterAll(async () => {
    // Clean up both tenants' probe rows and the org registry entries.
    await withOrgContext(prisma, orgA, (tx) => tx.$executeRaw`DELETE FROM "_rls_probe"`);
    await withOrgContext(prisma, orgB, (tx) => tx.$executeRaw`DELETE FROM "_rls_probe"`);
    await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await prisma.$disconnect();
  });

  it('Org A sees only its own rows, never Org B', async () => {
    const rows = await withOrgContext<ProbeRow[]>(
      prisma,
      orgA,
      (tx) => tx.$queryRaw<ProbeRow[]>`SELECT "organization_id", "payload" FROM "_rls_probe"`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organization_id === orgA)).toBe(true);
    expect(rows.some((row) => row.payload === 'secret-B')).toBe(false);
  });

  it('Org B sees only its own rows, never Org A (inverse)', async () => {
    const rows = await withOrgContext<ProbeRow[]>(
      prisma,
      orgB,
      (tx) => tx.$queryRaw<ProbeRow[]>`SELECT "organization_id", "payload" FROM "_rls_probe"`,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organization_id === orgB)).toBe(true);
    expect(rows.some((row) => row.payload === 'secret-A')).toBe(false);
  });

  it('with no org context set, no rows are visible at all', async () => {
    const rows = await prisma.$queryRaw<
      ProbeRow[]
    >`SELECT "organization_id", "payload" FROM "_rls_probe"`;
    expect(rows).toHaveLength(0);
  });
});

import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate extended to `organization_duplicate_flags` (M01, S-3): a
 * duplicate flag belongs to the FLAGGED organization and must never be
 * visible — or creatable — under another org's context, even though its
 * `matched_organization_id` column points at a second, different
 * organization. Connects as the NON-SUPERUSER `adoptafacil_app` role. Every
 * test name contains "no-leak" so the `test:rls` gate (-t "no-leak") runs it.
 * A superuser client is used only for seeding the required
 * `Organization`/`User` rows and for teardown.
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

describe('RLS cross-org no-leak (organization_duplicate_flags)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  const orgC = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();

  beforeAll(async () => {
    await prisma.$connect();
    await admin.organization.createMany({
      data: [
        { id: orgA, name: 'Org A' },
        { id: orgB, name: 'Org B' },
        { id: orgC, name: 'Org C' },
      ],
      skipDuplicates: true,
    });
    await admin.user.createMany({
      data: [
        {
          id: userA,
          organizationId: orgA,
          accountType: 'organization',
          email: `owner-a-${orgA}@test.local`,
          displayName: 'Owner A',
        },
        {
          id: userB,
          organizationId: orgB,
          accountType: 'organization',
          email: `owner-b-${orgB}@test.local`,
          displayName: 'Owner B',
        },
      ],
      skipDuplicates: true,
    });

    // Org A flagged as a possible duplicate of Org C; Org B flagged as a
    // possible duplicate of Org A — so Org A appears BOTH as a flagged
    // organization AND as a matched_organization_id on someone else's row,
    // proving the policy gates strictly on organization_id (the flagged
    // side), never leaking through the matched side either.
    await withOrgContext(prisma, orgA, (tx) =>
      tx.organizationDuplicateFlag.create({
        data: {
          organizationId: orgA,
          matchedOrganizationId: orgC,
          matchType: 'similar_name',
          similarityScore: 0.5,
        },
      }),
    );
    await withOrgContext(prisma, orgB, (tx) =>
      tx.organizationDuplicateFlag.create({
        data: {
          organizationId: orgB,
          matchedOrganizationId: orgA,
          matchType: 'similar_name',
          similarityScore: 0.6,
        },
      }),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB, orgC]);
    await admin.$disconnect();
  });

  it("no-leak: Org A sees only its own duplicate flag, never Org B's", async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) =>
      tx.organizationDuplicateFlag.findMany(),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgA)).toBe(true);
    expect(rows.some((row) => row.organizationId === orgB)).toBe(false);
  });

  it("no-leak: Org B sees only its own duplicate flag, never Org A's (inverse) — even though Org A is its matched_organization_id", async () => {
    const rows = await withOrgContext(prisma, orgB, (tx) =>
      tx.organizationDuplicateFlag.findMany(),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgB)).toBe(true);
    expect(rows.some((row) => row.organizationId === orgA)).toBe(false);
  });

  it('no-leak: Org C — which only ever appears as matched_organization_id, never as organization_id — sees nothing', async () => {
    const rows = await withOrgContext(prisma, orgC, (tx) =>
      tx.organizationDuplicateFlag.findMany(),
    );
    expect(rows).toHaveLength(0);
  });

  it('no-leak: with no tenant context, no duplicate flags are visible', async () => {
    const rows = await prisma.organizationDuplicateFlag.findMany();
    expect(rows).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks creating a duplicate flag for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.organizationDuplicateFlag.create({
          data: {
            organizationId: orgB,
            matchedOrganizationId: orgC,
            matchType: 'similar_name',
            similarityScore: 0.5,
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * RNF03 gate extended to RBAC AUTHORITY (`user_roles`): a role assignment must
 * never be visible or usable outside its organization, so an Administrator of
 * Org A holds no authority under Org B. Connects as the NON-SUPERUSER
 * `adoptafacil_app` role. Every test name contains "no-leak" so the `test:rls`
 * gate (-t "no-leak") runs the suite.
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

describe('RLS cross-org no-leak (user_roles authority)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        { id: orgA, name: 'Org A' },
        { id: orgB, name: 'Org B' },
      ],
      skipDuplicates: true,
    });
    await withOrgContext(prisma, orgA, async (tx) => {
      await tx.user.create({
        data: {
          id: userA,
          organizationId: orgA,
          accountType: 'organization',
          email: 'a@roles.test',
          displayName: 'A',
        },
      });
      await tx.userRole.create({
        data: { organizationId: orgA, userId: userA, role: 'administrator' },
      });
    });
    await withOrgContext(prisma, orgB, async (tx) => {
      await tx.user.create({
        data: {
          id: userB,
          organizationId: orgB,
          accountType: 'organization',
          email: 'b@roles.test',
          displayName: 'B',
        },
      });
      await tx.userRole.create({
        data: { organizationId: orgB, userId: userB, role: 'administrator' },
      });
    });
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await prisma.$disconnect();
  });

  it('no-leak: Org A sees only its own role assignments, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.userRole.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgA)).toBe(true);
    expect(rows.some((row) => row.userId === userB)).toBe(false);
  });

  it('no-leak: Org B sees only its own role assignments, never Org A (inverse)', async () => {
    const rows = await withOrgContext(prisma, orgB, (tx) => tx.userRole.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgB)).toBe(true);
    expect(rows.some((row) => row.userId === userA)).toBe(false);
  });

  it("no-leak: Org A's admin authority is invisible under Org B's context", async () => {
    const rows = await withOrgContext(prisma, orgB, (tx) =>
      tx.userRole.findMany({ where: { userId: userA } }),
    );
    expect(rows).toHaveLength(0);
  });

  it('no-leak: with no tenant context, no authority rows are visible', async () => {
    const rows = await prisma.userRole.findMany();
    expect(rows).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks granting authority for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.userRole.create({ data: { organizationId: orgB, userId: userB, role: 'operator' } }),
      ),
    ).rejects.toThrow();
  });
});

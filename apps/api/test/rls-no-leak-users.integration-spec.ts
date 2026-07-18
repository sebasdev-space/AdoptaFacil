import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';

/**
 * RNF03 gate extended to USER data (`users`). A user profile belongs to one
 * organization and must never be visible to another. Connects as the
 * NON-SUPERUSER `adoptafacil_app` role so RLS is genuinely enforced. Every test
 * name contains "no-leak" so the `test:rls` gate (-t "no-leak") runs the suite.
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

describe('RLS cross-org no-leak (users)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
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
    await withOrgContext(prisma, orgA, (tx) =>
      tx.user.create({
        data: {
          organizationId: orgA,
          accountType: 'organization',
          email: 'a@users.test',
          displayName: 'A',
        },
      }),
    );
    await withOrgContext(prisma, orgB, (tx) =>
      tx.user.create({
        data: {
          organizationId: orgB,
          accountType: 'organization',
          email: 'b@users.test',
          displayName: 'B',
        },
      }),
    );
  });

  afterAll(async () => {
    // ON DELETE CASCADE from organizations removes the users (referential
    // actions bypass RLS), cleaning up both tenants.
    await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    await prisma.$disconnect();
  });

  it('no-leak: Org A sees only its own users, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.user.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgA)).toBe(true);
    expect(rows.some((row) => row.email === 'b@users.test')).toBe(false);
  });

  it('no-leak: Org B sees only its own users, never Org A (inverse)', async () => {
    const rows = await withOrgContext(prisma, orgB, (tx) => tx.user.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgB)).toBe(true);
    expect(rows.some((row) => row.email === 'a@users.test')).toBe(false);
  });

  it('no-leak: with no tenant context, no user rows are visible', async () => {
    const rows = await prisma.user.findMany();
    expect(rows).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks creating a user for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.user.create({
          data: {
            organizationId: orgB,
            accountType: 'person',
            email: 'x@users.test',
            displayName: 'X',
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

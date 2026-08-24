import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate for M12 reviews (RF23 · S-7): tenant-isolated (no cross-org
 * visibility, no cross-org write) on the authenticated path. Connects as the
 * NON-SUPERUSER app role. Every test name contains "no-leak" so the
 * `test:rls` gate (-t "no-leak") runs it.
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

describe('RLS cross-org no-leak (reviews)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  const authorA = randomUUID();
  const authorB = randomUUID();

  beforeAll(async () => {
    await prisma.$connect();
    await admin.organization.createMany({
      data: [
        { id: orgA, name: 'Org A' },
        { id: orgB, name: 'Org B' },
      ],
      skipDuplicates: true,
    });
    await admin.user.createMany({
      data: [
        {
          id: authorA,
          organizationId: orgA,
          accountType: 'person',
          email: `author-a-${orgA}@test.local`,
          displayName: 'Autor A',
        },
        {
          id: authorB,
          organizationId: orgB,
          accountType: 'person',
          email: `author-b-${orgB}@test.local`,
          displayName: 'Autor B',
        },
      ],
      skipDuplicates: true,
    });

    await withOrgContext(prisma, orgA, (tx) =>
      tx.review.create({
        data: { organizationId: orgA, authorUserId: authorA, rating: 5, comment: 'Reseña A' },
      }),
    );
    await withOrgContext(prisma, orgB, (tx) =>
      tx.review.create({
        data: { organizationId: orgB, authorUserId: authorB, rating: 3, comment: 'Reseña B' },
      }),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own reviews, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.review.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
    expect(rows.some((r) => r.comment === 'Reseña B')).toBe(false);
  });

  it('no-leak: Org B sees only its own reviews, never Org A (inverse)', async () => {
    const rows = await withOrgContext(prisma, orgB, (tx) => tx.review.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgB)).toBe(true);
    expect(rows.some((r) => r.comment === 'Reseña A')).toBe(false);
  });

  it('no-leak: with no tenant context, no reviews are visible', async () => {
    expect(await prisma.review.findMany()).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks creating a review for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.review.create({
          data: { organizationId: orgB, authorUserId: authorA, rating: 1, comment: 'Intruso' },
        }),
      ),
    ).rejects.toThrow();
  });
});

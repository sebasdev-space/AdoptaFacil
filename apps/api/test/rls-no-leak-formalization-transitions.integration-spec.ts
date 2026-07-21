import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate + RF02 immutability for the formalization HISTORY
 * (`formalization_transitions`): tenant-isolated (no cross-org visibility) and
 * append-only (no UPDATE/DELETE, not even by a superuser). Connects as the
 * NON-SUPERUSER app role; a superuser client is used for the immutability probes
 * and teardown. no-leak tests carry "no-leak" so `test:rls` runs them.
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

describe('RLS + immutability (formalization_transitions)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  let rowAId = '';

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        { id: orgA, name: 'Org A' },
        { id: orgB, name: 'Org B' },
      ],
      skipDuplicates: true,
    });
    const rowA = await withOrgContext(prisma, orgA, (tx) =>
      tx.formalizationTransition.create({
        data: { organizationId: orgA, fromState: 'informal', toState: 'en_proceso', reason: 'A' },
      }),
    );
    rowAId = rowA.id;
    await withOrgContext(prisma, orgB, (tx) =>
      tx.formalizationTransition.create({
        data: { organizationId: orgB, fromState: 'informal', toState: 'en_proceso', reason: 'B' },
      }),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own history, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.formalizationTransition.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgA)).toBe(true);
    expect(rows.some((row) => row.reason === 'B')).toBe(false);
  });

  it('no-leak: with no tenant context, no history is visible', async () => {
    const rows = await prisma.formalizationTransition.findMany();
    expect(rows).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks writing history for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.formalizationTransition.create({
          data: { organizationId: orgB, fromState: 'informal', toState: 'en_proceso' },
        }),
      ),
    ).rejects.toThrow();
  });

  it('is append-only: a superuser cannot UPDATE or DELETE a history row', async () => {
    await expect(
      admin.$executeRawUnsafe(
        `UPDATE formalization_transitions SET reason = 'x' WHERE id = $1::uuid`,
        rowAId,
      ),
    ).rejects.toThrow(/append-only/i);
    await expect(
      admin.$executeRawUnsafe(`DELETE FROM formalization_transitions WHERE id = $1::uuid`, rowAId),
    ).rejects.toThrow(/append-only/i);
  });
});

import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate extended to `dian_verification_attempts` (M01, S-2, RNF07): a
 * verification attempt belongs to one organization and must never be visible
 * — or creatable — under another org's context. Connects as the
 * NON-SUPERUSER `adoptafacil_app` role. Every test name contains "no-leak" so
 * the `test:rls` gate (-t "no-leak") runs it. A superuser client is used only
 * for seeding the required `Organization`/`User` rows and for teardown.
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

describe('RLS cross-org no-leak (dian_verification_attempts)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();

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

    await withOrgContext(prisma, orgA, (tx) =>
      tx.dianVerificationAttempt.create({
        data: {
          organizationId: orgA,
          attemptNumber: 1,
          result: 'failure',
          triggeredBy: 'auto',
          actorUserId: null,
        },
      }),
    );
    await withOrgContext(prisma, orgB, (tx) =>
      tx.dianVerificationAttempt.create({
        data: {
          organizationId: orgB,
          attemptNumber: 1,
          result: 'success',
          triggeredBy: 'auto',
          actorUserId: null,
        },
      }),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own DIAN verification attempts, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.dianVerificationAttempt.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgA)).toBe(true);
    expect(rows.some((row) => row.organizationId === orgB)).toBe(false);
  });

  it('no-leak: Org B sees only its own DIAN verification attempts, never Org A (inverse)', async () => {
    const rows = await withOrgContext(prisma, orgB, (tx) => tx.dianVerificationAttempt.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgB)).toBe(true);
    expect(rows.some((row) => row.organizationId === orgA)).toBe(false);
  });

  it('no-leak: with no tenant context, no DIAN verification attempts are visible', async () => {
    const rows = await prisma.dianVerificationAttempt.findMany();
    expect(rows).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks creating a DIAN verification attempt for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.dianVerificationAttempt.create({
          data: {
            organizationId: orgB,
            attemptNumber: 1,
            result: 'failure',
            triggeredBy: 'auto',
            actorUserId: null,
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

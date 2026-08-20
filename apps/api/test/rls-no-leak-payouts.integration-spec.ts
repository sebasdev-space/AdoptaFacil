import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate for `payouts` and `organization_bank_accounts` (M15b, RF26):
 * tenant-isolated (no cross-org visibility, no cross-org write). Connects as
 * the NON-SUPERUSER app role. no-leak tests carry "no-leak" so `test:rls`
 * runs them (same pattern as rls-no-leak-clinical-reminders).
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
  await withOrgContext(prisma, orgId, async (tx) => {
    await tx.organizationBankAccount.create({
      data: {
        organizationId: orgId,
        bankCode: '001',
        accountType: 'savings',
        accountNumber: `${tag}-1234567890`,
        accountHolderName: `Org ${tag}`,
        accountHolderDocument: '900123456-1',
      },
    });
    await tx.payout.create({
      data: {
        organizationId: orgId,
        amount: 100_000,
        idempotencyKey: `no-leak-${tag}-${randomUUID()}`,
        status: 'scheduled',
      },
    });
  });
}

describe('RLS (payouts, organization_bank_accounts)', () => {
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

  it('no-leak: Org A sees only its own payouts, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.payout.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('no-leak: Org A sees only its own bank account, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.organizationBankAccount.findMany());
    expect(rows).toHaveLength(1);
    expect(rows[0].organizationId).toBe(orgA);
  });

  it('no-leak: with no tenant context, nothing is visible', async () => {
    expect(await prisma.payout.findMany()).toHaveLength(0);
    expect(await prisma.organizationBankAccount.findMany()).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks writing a payout for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.payout.create({
          data: {
            organizationId: orgB,
            amount: 100_000,
            idempotencyKey: `cross-write-${randomUUID()}`,
            status: 'scheduled',
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('no-leak: WITH CHECK blocks registering a bank account for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.organizationBankAccount.create({
          data: {
            organizationId: orgB,
            bankCode: '002',
            accountType: 'checking',
            accountNumber: 'hijack-0000000000',
            accountHolderName: 'Attacker',
            accountHolderDocument: '000000000-0',
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

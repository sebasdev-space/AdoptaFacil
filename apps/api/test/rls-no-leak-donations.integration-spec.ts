import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { computeBreakdown } from '@adoptafacil/contracts';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate extended to M05 donations (`donations` + `donation_receipts`, T-050): a
 * donation and its receipt belong to the beneficiary organization and must never be
 * visible under another org's context. Connects as the NON-SUPERUSER `adoptafacil_app`
 * role. Every test name contains "no-leak" so the `test:rls` gate (-t "no-leak") runs
 * it. A superuser client is used only for teardown.
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

async function seedDonationWithReceipt(
  prisma: PrismaClient,
  organizationId: string,
  payload: string,
) {
  const breakdown = computeBreakdown(50000, 'organization');
  await withOrgContext(prisma, organizationId, async (tx) => {
    const donation = await tx.donation.create({
      data: {
        organizationId,
        donorUserId: randomUUID(),
        conceptKind: 'organization',
        conceptId: organizationId,
        commissionPayer: 'organization',
        intendedAmount: 50000,
        amountCharged: breakdown.amountCharged,
        breakdown: breakdown as unknown as Prisma.InputJsonValue,
        collectionId: `col-${payload}-${randomUUID()}`,
        idempotencyKey: `key-${payload}-${randomUUID()}`,
        status: 'approved',
        payer: { fullName: payload, email: `${payload}@test.local` },
      },
    });
    await tx.donationReceipt.create({
      data: {
        organizationId,
        donationId: donation.id,
        dedupKey: `dedup-${payload}-${randomUUID()}`,
        donor: { fullName: payload, email: `${payload}@test.local` },
        intendedAmount: 50000,
        breakdown: breakdown as unknown as Prisma.InputJsonValue,
      },
    });
  });
}

describe('RLS cross-org no-leak (donations + donation_receipts)', () => {
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
    await seedDonationWithReceipt(prisma, orgA, 'secret-A');
    await seedDonationWithReceipt(prisma, orgB, 'secret-B');
  });

  afterAll(async () => {
    await purgeOrganizations(admin, [orgA, orgB]);
    await prisma.$disconnect();
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own donations, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) =>
      tx.donation.findMany({ select: { organizationId: true, collectionId: true } }),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
    expect(rows.some((r) => r.collectionId.includes('secret-B'))).toBe(false);
  });

  it('no-leak: Org B sees only its own donation receipts, never Org A (inverse)', async () => {
    const rows = await withOrgContext(prisma, orgB, (tx) =>
      tx.donationReceipt.findMany({ select: { organizationId: true, dedupKey: true } }),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgB)).toBe(true);
    expect(rows.some((r) => r.dedupKey.includes('secret-A'))).toBe(false);
  });

  it('no-leak: with no org context set, no donations or receipts are visible at all', async () => {
    const donations = await prisma.donation.findMany();
    const receipts = await prisma.donationReceipt.findMany();
    expect(donations).toHaveLength(0);
    expect(receipts).toHaveLength(0);
  });
});

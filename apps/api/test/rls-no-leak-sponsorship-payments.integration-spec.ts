import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate for M07 recurring billing (RF17 · S-5-REDISEÑO): tenant-isolated
 * (no cross-org visibility, no cross-org write) on the authenticated path,
 * for BOTH new tables. Connects as the NON-SUPERUSER app role.
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

describe('RLS cross-org no-leak (sponsorship_payments / sponsorship_payment_attempts)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  let sponsorshipA = '';
  let paymentA = '';
  let paymentB = '';

  async function seed(orgId: string, tag: string) {
    const sponsor = await admin.user.create({
      data: {
        organizationId: orgId,
        accountType: 'person',
        email: `sponsor-${tag}-${orgId}@test.local`,
        displayName: `Sponsor ${tag}`,
      },
    });
    const animal = await admin.animal.create({
      data: { organizationId: orgId, name: `Animal ${tag}`, species: 'dog' },
    });
    const plan = await admin.sponsorshipPlan.create({
      data: { organizationId: orgId, animalId: animal.id, name: `Plan ${tag}`, amount: 20_000 },
    });
    // `sponsorships` itself only grants INSERT via the `create_sponsorship()`
    // SECURITY DEFINER function (sponsor-side creation is always cross-tenant)
    // — the app role has no direct INSERT on this table, so seeding uses the
    // superuser connection. RLS on `sponsorships` is exercised elsewhere; this
    // file is about the two NEW tables only.
    const sponsorship = await admin.sponsorship.create({
      data: {
        organizationId: orgId,
        planId: plan.id,
        animalId: animal.id,
        sponsorUserId: sponsor.id,
      },
    });
    const payment = await withOrgContext(prisma, orgId, (tx) =>
      tx.sponsorshipPayment.create({
        data: { organizationId: orgId, sponsorshipId: sponsorship.id, period: '2026-08' },
      }),
    );
    await withOrgContext(prisma, orgId, (tx) =>
      tx.sponsorshipPaymentAttempt.create({
        data: {
          organizationId: orgId,
          sponsorshipPaymentId: payment.id,
          attemptNumber: 1,
          collectionId: `fake-col-${tag}`,
          idempotencyKey: `sponsorship:${sponsorship.id}:2026-08:attempt:1`,
          expiresAt: new Date('2026-09-30T00:00:00.000Z'),
        },
      }),
    );
    return { sponsorshipId: sponsorship.id, paymentId: payment.id };
  }

  beforeAll(async () => {
    await prisma.$connect();
    await admin.organization.createMany({
      data: [
        { id: orgA, name: 'Org A' },
        { id: orgB, name: 'Org B' },
      ],
      skipDuplicates: true,
    });

    const a = await seed(orgA, 'a');
    sponsorshipA = a.sponsorshipId;
    paymentA = a.paymentId;
    const b = await seed(orgB, 'b');
    paymentB = b.paymentId;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own payments, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.sponsorshipPayment.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
    expect(rows.some((r) => r.id === paymentB)).toBe(false);
  });

  it('no-leak: Org B sees only its own payments, never Org A (inverse)', async () => {
    const rows = await withOrgContext(prisma, orgB, (tx) => tx.sponsorshipPayment.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgB)).toBe(true);
    expect(rows.some((r) => r.id === paymentA)).toBe(false);
  });

  it('no-leak: with no tenant context, no payments or attempts are visible', async () => {
    expect(await prisma.sponsorshipPayment.findMany()).toHaveLength(0);
    expect(await prisma.sponsorshipPaymentAttempt.findMany()).toHaveLength(0);
  });

  it('no-leak: Org A sees only its own attempts, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) =>
      tx.sponsorshipPaymentAttempt.findMany(),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('no-leak: WITH CHECK blocks creating a payment for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.sponsorshipPayment.create({
          data: { organizationId: orgB, sponsorshipId: sponsorshipA, period: '2026-09' },
        }),
      ),
    ).rejects.toThrow();
  });

  it('no-leak: WITH CHECK blocks creating an attempt for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.sponsorshipPaymentAttempt.create({
          data: {
            organizationId: orgB,
            sponsorshipPaymentId: paymentA,
            attemptNumber: 2,
            collectionId: 'fake-col-intruso',
            idempotencyKey: `sponsorship:${sponsorshipA}:2026-08:attempt:2`,
            expiresAt: new Date('2026-09-30T00:00:00.000Z'),
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('no-leak: the append-only triggers reject DELETE even for the app role', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.sponsorshipPayment.delete({ where: { id: paymentA } }),
      ),
    ).rejects.toThrow();
  });
});

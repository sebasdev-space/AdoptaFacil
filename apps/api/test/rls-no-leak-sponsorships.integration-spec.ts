import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate for M07 sponsorships (RF17 · T-056): plans, sponsorships, and their
 * status history are tenant-isolated (no cross-org visibility, no cross-org
 * write) on the authenticated path. Connects as the NON-SUPERUSER app role.
 * no-leak tests carry "no-leak" so `test:rls` runs them.
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

/** Seed an animal, a plan, a sponsorship and a history row for an org (admin bypasses RLS). */
async function seed(
  admin: PrismaClient,
  orgId: string,
  tag: string,
): Promise<{ planId: string; sponsorshipId: string }> {
  const animal = await admin.animal.create({
    data: { organizationId: orgId, name: `Animal ${tag}`, species: 'dog' },
  });
  const plan = await admin.sponsorshipPlan.create({
    data: {
      organizationId: orgId,
      animalId: animal.id,
      name: `Plan ${tag}`,
      amount: 30_000,
      periodicity: 'monthly',
    },
  });
  const sponsorship = await admin.sponsorship.create({
    data: {
      organizationId: orgId,
      planId: plan.id,
      animalId: animal.id,
      sponsorUserId: randomUUID(),
      status: 'active',
    },
  });
  await admin.sponsorshipStatusHistory.create({
    data: {
      organizationId: orgId,
      sponsorshipId: sponsorship.id,
      fromStatus: null,
      toStatus: 'active',
    },
  });
  return { planId: plan.id, sponsorshipId: sponsorship.id };
}

describe('RLS (sponsorship plans + sponsorships + history)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  let seededB: { planId: string; sponsorshipId: string };

  beforeAll(async () => {
    await prisma.$connect();
    await admin.organization.createMany({
      data: [
        { id: orgA, name: 'Org A' },
        { id: orgB, name: 'Org B' },
      ],
      skipDuplicates: true,
    });
    await seed(admin, orgA, 'A');
    seededB = await seed(admin, orgB, 'B');
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own plans, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.sponsorshipPlan.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('no-leak: Org A sees only its own sponsorships, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.sponsorship.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('no-leak: Org A sees only its own status history, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.sponsorshipStatusHistory.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('no-leak: with no tenant context, nothing is visible', async () => {
    expect(await prisma.sponsorshipPlan.findMany()).toHaveLength(0);
    expect(await prisma.sponsorship.findMany()).toHaveLength(0);
    expect(await prisma.sponsorshipStatusHistory.findMany()).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks writing a plan for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.sponsorshipPlan.create({
          data: {
            organizationId: orgB,
            animalId: randomUUID(),
            name: 'X',
            amount: 1000,
            periodicity: 'monthly',
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it("least-privilege: Org A cannot UPDATE (suspend) Org B's sponsorship directly", async () => {
    // RLS WITH CHECK filters the row out entirely under Org A's context — the
    // update matches 0 rows, so `updateMany` succeeds with count 0 (not an error);
    // asserting count===0 proves cross-org writes never take effect.
    const result = await withOrgContext(prisma, orgA, (tx) =>
      tx.sponsorship.updateMany({
        where: { id: seededB.sponsorshipId },
        data: { status: 'suspended' },
      }),
    );
    expect(result.count).toBe(0);
  });
});

import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate extended to `animal_behavior_disclosures` (M03, S-9, FSD v3.5
 * Doc 4). Same technique as `rls-no-leak-legal-representatives`: connects as
 * the NON-SUPERUSER `adoptafacil_app` role. Every test name contains
 * "no-leak" so the `test:rls` gate (-t "no-leak") runs it. A superuser client
 * is used only for seeding the required `User`/`Animal` rows and for teardown.
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

describe('RLS cross-org no-leak (animal_behavior_disclosures)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();
  const animalA = randomUUID();
  const animalB = randomUUID();

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
      tx.animal.create({
        data: { id: animalA, organizationId: orgA, name: 'Firulais A', species: 'dog' },
      }),
    );
    await withOrgContext(prisma, orgB, (tx) =>
      tx.animal.create({
        data: { id: animalB, organizationId: orgB, name: 'Firulais B', species: 'dog' },
      }),
    );

    await withOrgContext(prisma, orgA, (tx) =>
      tx.animalBehaviorDisclosure.create({
        data: {
          organizationId: orgA,
          animalId: animalA,
          declaredByUserId: userA,
          signedByName: 'Owner A',
          biteHistory: false,
          childrenCompatibility: 'yes',
          signatureHash: 'hash-a',
        },
      }),
    );
    await withOrgContext(prisma, orgB, (tx) =>
      tx.animalBehaviorDisclosure.create({
        data: {
          organizationId: orgB,
          animalId: animalB,
          declaredByUserId: userB,
          signedByName: 'Owner B',
          biteHistory: false,
          childrenCompatibility: 'yes',
          signatureHash: 'hash-b',
        },
      }),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own disclosure, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.animalBehaviorDisclosure.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgA)).toBe(true);
    expect(rows.some((row) => row.signatureHash === 'hash-b')).toBe(false);
  });

  it('no-leak: Org B sees only its own disclosure, never Org A (inverse)', async () => {
    const rows = await withOrgContext(prisma, orgB, (tx) => tx.animalBehaviorDisclosure.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgB)).toBe(true);
    expect(rows.some((row) => row.signatureHash === 'hash-a')).toBe(false);
  });

  it('no-leak: with no tenant context, no disclosures are visible', async () => {
    const rows = await prisma.animalBehaviorDisclosure.findMany();
    expect(rows).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks creating a disclosure for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.animalBehaviorDisclosure.create({
          data: {
            organizationId: orgB,
            animalId: animalB,
            declaredByUserId: userA,
            signedByName: 'Intruso',
            biteHistory: false,
            childrenCompatibility: 'yes',
            signatureHash: 'x',
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it("no-leak: DELETE is rejected by the append-only trigger, even for the row's own org", async () => {
    const [row] = await withOrgContext(prisma, orgA, (tx) =>
      tx.animalBehaviorDisclosure.findMany({ where: { organizationId: orgA } }),
    );
    expect(row).toBeDefined();
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.animalBehaviorDisclosure.delete({ where: { id: row.id } }),
      ),
    ).rejects.toThrow();
  });
});

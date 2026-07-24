import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate extended to M04 adoption CONTRACTS (`adoption_contracts`, T-028b): a
 * contract belongs to the owning organization and must never be visible under
 * another org's context. Connects as the NON-SUPERUSER `adoptafacil_app` role.
 * Every test name contains "no-leak" so the `test:rls` gate (-t "no-leak") runs it.
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

/** Seed a request + its contract for `organizationId`, tagging the payload. */
async function seedContract(
  prisma: PrismaClient,
  organizationId: string,
  payload: string,
): Promise<void> {
  await withOrgContext(prisma, organizationId, async (tx) => {
    const animalId = randomUUID();
    const req = await tx.adoptionRequest.create({
      data: {
        organizationId,
        animalId,
        animalSnapshot: { animalId, name: payload, species: 'dog' },
        applicantUserId: randomUUID(),
        applicant: { fullName: payload, email: `${payload}@test.local` },
        message: `Solicitud ${payload} con un mensaje suficientemente largo para pasar.`,
      },
    });
    await tx.adoptionContract.create({
      data: {
        organizationId,
        requestId: req.id,
        animalId,
        version: 1,
        status: 'draft',
        signers: [{ id: randomUUID(), role: 'adopter', fullName: payload, email: 'x@test.local' }],
        payload: { requestId: req.id, organizationId, animalId, terms: payload },
      },
    });
  });
}

describe('RLS cross-org no-leak (adoption_contracts)', () => {
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
    await seedContract(prisma, orgA, 'secret-A');
    await seedContract(prisma, orgB, 'secret-B');
  });

  afterAll(async () => {
    await purgeOrganizations(admin, [orgA, orgB]);
    await prisma.$disconnect();
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own contracts, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) =>
      tx.adoptionContract.findMany({ select: { organizationId: true } }),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('no-leak: Org B sees only its own contracts, never Org A (inverse)', async () => {
    const rows = await withOrgContext(prisma, orgB, (tx) =>
      tx.adoptionContract.findMany({ select: { organizationId: true } }),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgB)).toBe(true);
  });

  it('no-leak: with no org context set, no contracts are visible at all', async () => {
    const rows = await prisma.adoptionContract.findMany();
    expect(rows).toHaveLength(0);
  });
});

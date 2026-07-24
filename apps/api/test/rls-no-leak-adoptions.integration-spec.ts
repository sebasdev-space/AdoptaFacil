import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate extended to M04 adoption requests (`adoption_requests`, T-028a): a
 * request belongs to the owning organization and must never be visible under
 * another org's context. Connects as the NON-SUPERUSER `adoptafacil_app` role.
 * Every test name contains "no-leak" so the `test:rls` gate (-t "no-leak") runs
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

function seedRequest(organizationId: string, payload: string) {
  return {
    organizationId,
    animalId: randomUUID(),
    animalSnapshot: { animalId: randomUUID(), name: payload, species: 'dog' },
    applicantUserId: randomUUID(),
    applicant: { fullName: payload, email: `${payload}@test.local` },
    message: `Quiero adoptar — ${payload} — con un mensaje suficientemente largo.`,
  };
}

describe('RLS cross-org no-leak (adoption_requests)', () => {
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
    await withOrgContext(prisma, orgA, (tx) =>
      tx.adoptionRequest.create({ data: seedRequest(orgA, 'secret-A') }),
    );
    await withOrgContext(prisma, orgB, (tx) =>
      tx.adoptionRequest.create({ data: seedRequest(orgB, 'secret-B') }),
    );
  });

  afterAll(async () => {
    await purgeOrganizations(admin, [orgA, orgB]);
    await prisma.$disconnect();
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own adoption requests, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) =>
      tx.adoptionRequest.findMany({ select: { organizationId: true, message: true } }),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
    expect(rows.some((r) => r.message.includes('secret-B'))).toBe(false);
  });

  it('no-leak: Org B sees only its own adoption requests, never Org A (inverse)', async () => {
    const rows = await withOrgContext(prisma, orgB, (tx) =>
      tx.adoptionRequest.findMany({ select: { organizationId: true, message: true } }),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgB)).toBe(true);
    expect(rows.some((r) => r.message.includes('secret-A'))).toBe(false);
  });

  it('no-leak: with no org context set, no adoption requests are visible at all', async () => {
    const rows = await prisma.adoptionRequest.findMany();
    expect(rows).toHaveLength(0);
  });
});

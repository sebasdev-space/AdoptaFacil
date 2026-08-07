import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * F1-01 · `adoption_requests_for_applicant` (SECURITY DEFINER, cross-tenant BY
 * IDENTITY — same pattern as `donations_for_donor`, T-050/S1-02). RLS alone isn't
 * enough here: a single applicant can have requests in MULTIPLE organizations
 * (none of which they're a member of), so the isolation guarantee this function
 * must uphold is per-APPLICANT, not per-tenant. Connects as the NON-SUPERUSER
 * `adoptafacil_app` role — never sets `app.current_org_id`, since the function
 * bypasses RLS by identity, not by tenant context. Every test name contains
 * "no-leak" so the `test:rls` gate (-t "no-leak") runs it.
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

function seedRequest(organizationId: string, applicantUserId: string, payload: string) {
  return {
    organizationId,
    animalId: randomUUID(),
    animalSnapshot: { animalId: randomUUID(), name: payload, species: 'dog' },
    applicantUserId,
    applicant: { fullName: payload, email: `${payload}@test.local` },
    message: `Quiero adoptar — ${payload} — con un mensaje suficientemente largo.`,
  };
}

interface AdoptionRow {
  message: string;
  applicant_user_id: string;
  organization_id: string;
}

describe('RLS cross-org no-leak (adoption_requests_for_applicant, F1-01)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  const applicant1 = randomUUID();
  const applicant2 = randomUUID();

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        { id: orgA, name: 'Org A' },
        { id: orgB, name: 'Org B' },
      ],
      skipDuplicates: true,
    });
    // applicant1 applied to TWO different orgs (neither is their own) — the
    // whole reason this can't be a plain RLS-scoped query.
    await withOrgContext(prisma, orgA, (tx) =>
      tx.adoptionRequest.create({ data: seedRequest(orgA, applicant1, 'secret-1-orgA') }),
    );
    await withOrgContext(prisma, orgB, (tx) =>
      tx.adoptionRequest.create({ data: seedRequest(orgB, applicant1, 'secret-1-orgB') }),
    );
    // applicant2 applied to orgA too (same org as applicant1's first request) —
    // proves isolation is by APPLICANT, not merely by org.
    await withOrgContext(prisma, orgA, (tx) =>
      tx.adoptionRequest.create({ data: seedRequest(orgA, applicant2, 'secret-2-orgA') }),
    );
  });

  afterAll(async () => {
    await purgeOrganizations(admin, [orgA, orgB]);
    await prisma.$disconnect();
    await admin.$disconnect();
  });

  it('no-leak: applicant1 sees both of THEIR requests, across both orgs', async () => {
    const rows = await prisma.$queryRaw<AdoptionRow[]>(Prisma.sql`
      SELECT * FROM adoption_requests_for_applicant(${applicant1}::uuid)
    `);
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.applicant_user_id === applicant1)).toBe(true);
    expect(rows.some((r) => r.message.includes('secret-1-orgA'))).toBe(true);
    expect(rows.some((r) => r.message.includes('secret-1-orgB'))).toBe(true);
    // never applicant2's request, even though it lives in one of the same orgs.
    expect(rows.some((r) => r.message.includes('secret-2-orgA'))).toBe(false);
  });

  it("no-leak: applicant2 sees only THEIR request, never applicant1's (inverse)", async () => {
    const rows = await prisma.$queryRaw<AdoptionRow[]>(Prisma.sql`
      SELECT * FROM adoption_requests_for_applicant(${applicant2}::uuid)
    `);
    expect(rows.length).toBe(1);
    expect(rows[0].applicant_user_id).toBe(applicant2);
    expect(rows[0].message).toContain('secret-2-orgA');
    expect(rows.some((r) => r.message.includes('secret-1'))).toBe(false);
  });

  it('no-leak: an unknown applicant id returns nothing (no accidental wildcard match)', async () => {
    const rows = await prisma.$queryRaw<AdoptionRow[]>(Prisma.sql`
      SELECT * FROM adoption_requests_for_applicant(${randomUUID()}::uuid)
    `);
    expect(rows).toHaveLength(0);
  });
});

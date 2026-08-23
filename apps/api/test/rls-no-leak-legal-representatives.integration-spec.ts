import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate extended to `legal_representatives` (M01, S-1, RNF10): a legal
 * representative record belongs to one organization and must never be visible
 * — or creatable — under another org's context. Connects as the NON-SUPERUSER
 * `adoptafacil_app` role. Every test name contains "no-leak" so the `test:rls`
 * gate (-t "no-leak") runs it. A superuser client is used only for seeding the
 * required `User` row (itself RLS-protected) and for teardown.
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

describe('RLS cross-org no-leak (legal_representatives)', () => {
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
    // `member` is a real FK to `users` (also RLS-protected) — seed it directly
    // as superuser, same as other no-leak specs seed their tables' dependencies.
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
      tx.legalRepresentative.create({
        data: {
          organizationId: orgA,
          memberId: userA,
          fullName: 'Representante A',
          documentType: 'cedula_ciudadania',
          documentNumber: 'A-DOC',
          position: 'Representante legal',
          signatureFileRef: 'private/org-a/sig.enc',
          signatureHash: 'hash-a',
          signedAt: new Date(),
        },
      }),
    );
    await withOrgContext(prisma, orgB, (tx) =>
      tx.legalRepresentative.create({
        data: {
          organizationId: orgB,
          memberId: userB,
          fullName: 'Representante B',
          documentType: 'cedula_ciudadania',
          documentNumber: 'B-DOC',
          position: 'Representante legal',
          signatureFileRef: 'private/org-b/sig.enc',
          signatureHash: 'hash-b',
          signedAt: new Date(),
        },
      }),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own legal representative, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.legalRepresentative.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgA)).toBe(true);
    expect(rows.some((row) => row.documentNumber === 'B-DOC')).toBe(false);
  });

  it('no-leak: Org B sees only its own legal representative, never Org A (inverse)', async () => {
    const rows = await withOrgContext(prisma, orgB, (tx) => tx.legalRepresentative.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgB)).toBe(true);
    expect(rows.some((row) => row.documentNumber === 'A-DOC')).toBe(false);
  });

  it('no-leak: with no tenant context, no legal representatives are visible', async () => {
    const rows = await prisma.legalRepresentative.findMany();
    expect(rows).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks creating a legal representative for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.legalRepresentative.create({
          data: {
            organizationId: orgB,
            memberId: userA,
            fullName: 'Intruso',
            documentType: 'cedula_ciudadania',
            documentNumber: 'X',
            position: 'X',
            signatureFileRef: 'private/x/sig.enc',
            signatureHash: 'x',
            signedAt: new Date(),
          },
        }),
      ),
    ).rejects.toThrow();
  });
});

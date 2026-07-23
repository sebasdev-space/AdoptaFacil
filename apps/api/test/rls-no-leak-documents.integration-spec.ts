import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate + RNF05 immutability for organization_documents: tenant-isolated
 * (no cross-org visibility, no cross-org write) AND immutable after a decision
 * (no UPDATE once decided; no DELETE/TRUNCATE ever, not even by a superuser).
 * Also asserts the cross-tenant platform review path is confined to the bounded
 * SECURITY DEFINER functions — an org-context read never sees another org.
 * Connects as the NON-SUPERUSER app role; a superuser client is used for the
 * immutability probes, the DEFINER decision call, and teardown. no-leak tests
 * carry "no-leak" so `test:rls` runs them.
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

describe('RLS + immutability (organization_documents)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  const reviewer = randomUUID();
  let docAId = '';

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        { id: orgA, name: 'Org A' },
        { id: orgB, name: 'Org B' },
      ],
      skipDuplicates: true,
    });
    const docA = await withOrgContext(prisma, orgA, (tx) =>
      tx.organizationDocument.create({
        data: { organizationId: orgA, type: 'rut', storageRef: 'orgs/a/doc', version: 1 },
      }),
    );
    docAId = docA.id;
    await withOrgContext(prisma, orgB, (tx) =>
      tx.organizationDocument.create({
        data: { organizationId: orgB, type: 'rut', storageRef: 'orgs/b/doc', version: 1 },
      }),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own documents, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.organizationDocument.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgA)).toBe(true);
    expect(rows.some((row) => row.storageRef.includes('/b/'))).toBe(false);
  });

  it('no-leak: with no tenant context, no documents are visible', async () => {
    const rows = await prisma.organizationDocument.findMany();
    expect(rows).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks writing a document for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.organizationDocument.create({
          data: { organizationId: orgB, type: 'rut', storageRef: 'x', version: 2 },
        }),
      ),
    ).rejects.toThrow();
  });

  it('no-leak: the platform review path (SECURITY DEFINER) does not leak laterally to an org read', async () => {
    // The queue function is the ONLY cross-tenant read; a normal org-context read
    // still sees only its own org (proven above). Here we confirm the function
    // itself only surfaces pending/under_review rows across orgs and nothing more
    // than the bounded columns.
    const [{ data }] = await prisma.$queryRaw<Array<{ data: Array<Record<string, unknown>> }>>(
      Prisma.sql`SELECT platform_document_queue() AS data`,
    );
    const ours = data.filter((d) => d.organizationId === orgA || d.organizationId === orgB);
    expect(ours.length).toBeGreaterThanOrEqual(2);
    for (const item of ours) {
      // Bounded shape only — no legal_name/phone or other private columns.
      expect(Object.keys(item).sort()).toEqual(
        [
          'createdAt',
          'expiresAt',
          'id',
          'issuedAt',
          'organizationId',
          'organizationName',
          'status',
          'storageRef',
          'type',
          'version',
        ].sort(),
      );
    }
  });

  it('is immutable after a decision: no UPDATE once decided, no DELETE ever (superuser included)', async () => {
    // Decide via the same bounded SECURITY DEFINER path the platform uses.
    await admin.$queryRawUnsafe(
      `SELECT platform_document_decide($1::uuid, $2, $3::uuid, $4)`,
      docAId,
      'approved',
      reviewer,
      null,
    );
    // Frozen: even a superuser cannot alter the review metadata now.
    await expect(
      admin.$executeRawUnsafe(
        `UPDATE organization_documents SET review_note = 'x' WHERE id = $1::uuid`,
        docAId,
      ),
    ).rejects.toThrow(/immutable/i);
    // History is kept forever: DELETE is rejected for every role.
    await expect(
      admin.$executeRawUnsafe(`DELETE FROM organization_documents WHERE id = $1::uuid`, docAId),
    ).rejects.toThrow(/history/i);
  });
});

import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate extended to the M14 portal theme (`portal_themes`, T-027): a theme
 * belongs to one organization and must never be visible under another org's
 * context. Connects as the NON-SUPERUSER `adoptafacil_app` role. Every test name
 * contains "no-leak" so the `test:rls` gate (-t "no-leak") runs it. A superuser
 * client is used only for teardown.
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

describe('RLS cross-org no-leak (portal_themes)', () => {
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
      tx.portalTheme.create({ data: { organizationId: orgA, tokens: { primary: '1 1% 1%' } } }),
    );
    await withOrgContext(prisma, orgB, (tx) =>
      tx.portalTheme.create({ data: { organizationId: orgB, tokens: { primary: '2 2% 2%' } } }),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own theme, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.portalTheme.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgA)).toBe(true);
  });

  it('no-leak: Org B sees only its own theme, never Org A (inverse)', async () => {
    const rows = await withOrgContext(prisma, orgB, (tx) => tx.portalTheme.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.organizationId === orgB)).toBe(true);
  });

  it('no-leak: with no tenant context, no themes are visible', async () => {
    const rows = await prisma.portalTheme.findMany();
    expect(rows).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks writing a theme for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.portalTheme.create({ data: { organizationId: orgB, tokens: {} } }),
      ),
    ).rejects.toThrow();
  });
});

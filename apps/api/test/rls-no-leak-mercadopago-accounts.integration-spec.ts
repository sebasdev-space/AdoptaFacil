import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate for `organization_mercadopago_accounts` (T-OAuth-Connect, Split
 * de Pagos 1:1): tenant-isolated (no cross-org visibility, no cross-org
 * write/delete), same pattern as `rls-no-leak-payouts.integration-spec.ts`.
 * Connects as the NON-SUPERUSER `adoptafacil_app` role. Every test name
 * carries "no-leak" so `test:rls` (-t "no-leak") runs it. A superuser client
 * is used only for teardown.
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

async function seed(prisma: PrismaClient, orgId: string, tag: string): Promise<void> {
  await withOrgContext(prisma, orgId, async (tx) => {
    await tx.organizationMercadoPagoAccount.create({
      data: {
        organizationId: orgId,
        mpUserId: `mp-user-${tag}`,
        accessToken: `secret-access-token-${tag}`,
        refreshToken: `secret-refresh-token-${tag}`,
        expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      },
    });
  });
}

describe('RLS (organization_mercadopago_accounts)', () => {
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
    await seed(prisma, orgA, 'A');
    await seed(prisma, orgB, 'B');
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own connected account, never Org B (including the tokens)', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) =>
      tx.organizationMercadoPagoAccount.findMany(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].organizationId).toBe(orgA);
    expect(rows[0].accessToken).toBe('secret-access-token-A');
    expect(rows.some((r) => r.accessToken.includes('-B'))).toBe(false);
  });

  it('no-leak: Org B sees only its own connected account, never Org A (inverse)', async () => {
    const rows = await withOrgContext(prisma, orgB, (tx) =>
      tx.organizationMercadoPagoAccount.findMany(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].organizationId).toBe(orgB);
    expect(rows.some((r) => r.accessToken.includes('-A'))).toBe(false);
  });

  it('no-leak: with no tenant context, nothing is visible', async () => {
    expect(await prisma.organizationMercadoPagoAccount.findMany()).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks connecting an account for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.organizationMercadoPagoAccount.create({
          data: {
            organizationId: orgB,
            mpUserId: 'hijack-user',
            accessToken: 'hijack-access',
            refreshToken: 'hijack-refresh',
            expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it("no-leak: Org A cannot disconnect (delete) Org B's account", async () => {
    await withOrgContext(prisma, orgA, (tx) =>
      tx.organizationMercadoPagoAccount.deleteMany({ where: { organizationId: orgB } }),
    );
    // The row survives — RLS scoped the DELETE to orgA's own rows (zero match).
    const survives = await withOrgContext(prisma, orgB, (tx) =>
      tx.organizationMercadoPagoAccount.findUnique({ where: { organizationId: orgB } }),
    );
    expect(survives).not.toBeNull();
  });
});

import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate for clinical_reminders: tenant-isolated (no cross-org visibility, no
 * cross-org write), including rows the background worker generates. Connects as
 * the NON-SUPERUSER app role. no-leak tests carry "no-leak" so `test:rls` runs them.
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
    const animal = await tx.animal.create({
      data: { organizationId: orgId, name: `Animal ${tag}`, species: 'dog' },
    });
    await tx.clinicalReminder.create({
      data: {
        organizationId: orgId,
        animalId: animal.id,
        clinicalEventId: randomUUID(),
        reminderType: 'vaccine',
        dueDate: new Date('2026-07-01T00:00:00.000Z'),
      },
    });
  });
}

describe('RLS (clinical_reminders)', () => {
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

  it('no-leak: Org A sees only its own reminders, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.clinicalReminder.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('no-leak: with no tenant context, no reminders are visible', async () => {
    expect(await prisma.clinicalReminder.findMany()).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks writing a reminder for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, async (tx) => {
        const animal = await tx.animal.findFirst({ where: { organizationId: orgA } });
        return tx.clinicalReminder.create({
          data: {
            organizationId: orgB,
            animalId: animal!.id,
            clinicalEventId: randomUUID(),
            reminderType: 'vaccine',
            dueDate: new Date(),
          },
        });
      }),
    ).rejects.toThrow();
  });
});

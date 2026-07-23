import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate + RNF05 immutability for the clinical record: clinical_events and
 * clinical_event_attachments are tenant-isolated (no cross-org visibility, no
 * cross-org write) AND append-only (no UPDATE/DELETE, not even by a superuser).
 * Connects as the NON-SUPERUSER app role; a superuser client is used for the
 * immutability probes and teardown. no-leak tests carry "no-leak".
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

async function seed(prisma: PrismaClient, orgId: string, tag: string): Promise<string> {
  return withOrgContext(prisma, orgId, async (tx) => {
    const animal = await tx.animal.create({
      data: { organizationId: orgId, name: `Animal ${tag}`, species: 'dog' },
    });
    const event = await tx.clinicalEvent.create({
      data: {
        eventId: randomUUID(),
        organizationId: orgId,
        animalId: animal.id,
        type: 'vaccine',
        occurredAt: new Date('2026-07-01T00:00:00.000Z'),
        version: 1,
        authorUserId: randomUUID(),
        details: { tag },
      },
    });
    await tx.clinicalEventAttachment.create({
      data: {
        organizationId: orgId,
        clinicalEventId: event.id,
        storageRef: `orgs/${tag}/att`,
        order: 0,
      },
    });
    return event.id;
  });
}

describe('RLS + immutability (clinical_events, clinical_event_attachments)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  let eventAId = '';

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        { id: orgA, name: 'Org A' },
        { id: orgB, name: 'Org B' },
      ],
      skipDuplicates: true,
    });
    eventAId = await seed(prisma, orgA, 'A');
    await seed(prisma, orgB, 'B');
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own clinical events, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.clinicalEvent.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
  });

  it('no-leak: Org A sees only its own clinical attachments', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.clinicalEventAttachment.findMany());
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
    expect(rows.some((r) => r.storageRef.includes('/B/'))).toBe(false);
  });

  it('no-leak: with no tenant context, nothing is visible', async () => {
    expect(await prisma.clinicalEvent.findMany()).toHaveLength(0);
    expect(await prisma.clinicalEventAttachment.findMany()).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks writing a clinical event for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, async (tx) => {
        const animal = await tx.animal.findFirst({ where: { organizationId: orgA } });
        return tx.clinicalEvent.create({
          data: {
            eventId: randomUUID(),
            organizationId: orgB,
            animalId: animal!.id,
            type: 'vaccine',
            occurredAt: new Date(),
            version: 1,
            authorUserId: randomUUID(),
          },
        });
      }),
    ).rejects.toThrow();
  });

  it('is append-only: a superuser cannot UPDATE or DELETE a clinical event version (RNF05)', async () => {
    await expect(
      admin.$executeRawUnsafe(
        `UPDATE clinical_events SET version = 99 WHERE id = $1::uuid`,
        eventAId,
      ),
    ).rejects.toThrow(/append-only/i);
    await expect(
      admin.$executeRawUnsafe(`DELETE FROM clinical_events WHERE id = $1::uuid`, eventAId),
    ).rejects.toThrow(/append-only/i);
  });
});

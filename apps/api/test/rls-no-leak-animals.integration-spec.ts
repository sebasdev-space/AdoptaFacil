import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { purgeOrganizations } from './support/cleanup';

/**
 * RNF03 gate for the M03 animal record: animals, animal_photos and animal_breeds
 * are tenant-isolated (no cross-org visibility, no cross-org write). Plus RF07
 * soft-delete enforcement: a superuser cannot physically DELETE an animal.
 * Connects as the NON-SUPERUSER app role; a superuser client is used for the
 * delete probe and teardown. no-leak tests carry "no-leak" so `test:rls` runs them.
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
    const breed = await tx.animalBreed.create({
      data: { organizationId: orgId, species: 'dog', name: `Breed ${tag}` },
    });
    const animal = await tx.animal.create({
      data: { organizationId: orgId, name: `Animal ${tag}`, species: 'dog', breedId: breed.id },
    });
    await tx.animalPhoto.create({
      data: { organizationId: orgId, animalId: animal.id, storageRef: `orgs/${tag}/p`, order: 0 },
    });
    return animal.id;
  });
}

describe('RLS + soft-delete (animals, animal_photos, animal_breeds)', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: APP_DATABASE_URL } } });
  const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const orgA = randomUUID();
  const orgB = randomUUID();
  let animalAId = '';

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        { id: orgA, name: 'Org A' },
        { id: orgB, name: 'Org B' },
      ],
      skipDuplicates: true,
    });
    animalAId = await seed(prisma, orgA, 'A');
    await seed(prisma, orgB, 'B');
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await purgeOrganizations(admin, [orgA, orgB]);
    await admin.$disconnect();
  });

  it('no-leak: Org A sees only its own animals, never Org B', async () => {
    const rows = await withOrgContext(prisma, orgA, (tx) => tx.animal.findMany());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organizationId === orgA)).toBe(true);
    expect(rows.some((r) => r.name.includes('B'))).toBe(false);
  });

  it('no-leak: Org A sees only its own breeds and photos', async () => {
    const { breeds, photos } = await withOrgContext(prisma, orgA, async (tx) => ({
      breeds: await tx.animalBreed.findMany(),
      photos: await tx.animalPhoto.findMany(),
    }));
    expect(breeds.every((b) => b.organizationId === orgA)).toBe(true);
    expect(photos.every((p) => p.organizationId === orgA)).toBe(true);
    expect(photos.some((p) => p.storageRef.includes('/B/'))).toBe(false);
  });

  it('no-leak: with no tenant context, nothing is visible', async () => {
    expect(await prisma.animal.findMany()).toHaveLength(0);
    expect(await prisma.animalBreed.findMany()).toHaveLength(0);
    expect(await prisma.animalPhoto.findMany()).toHaveLength(0);
  });

  it('no-leak: WITH CHECK blocks writing an animal for a different org than the context', async () => {
    await expect(
      withOrgContext(prisma, orgA, (tx) =>
        tx.animal.create({ data: { organizationId: orgB, name: 'X', species: 'cat' } }),
      ),
    ).rejects.toThrow();
  });

  it('is soft-delete only: a superuser cannot physically DELETE an animal (RF07)', async () => {
    await expect(
      admin.$executeRawUnsafe(`DELETE FROM animals WHERE id = $1::uuid`, animalAId),
    ).rejects.toThrow(/soft-delete only/i);
  });
});

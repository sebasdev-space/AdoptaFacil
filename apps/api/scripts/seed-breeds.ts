/**
 * Preload the common breed catalog (S2-04A) for every EXISTING organization
 * that's still missing some of it — e.g. an org created before this feature
 * shipped, or before the T-tags-breed-catalog migration's one-time backfill
 * ran against this database. New organizations get the catalog automatically
 * at registration (`AuthService.register`); the migration backfills orgs that
 * already existed at deploy time. This script exists for a THIRD case: a dev
 * database seeded/restored out of band, or re-running after editing the
 * catalog (`animal-breeds.catalog.ts`) to add breeds later.
 *
 * Usage (from repo root):
 *   pnpm seed:breeds
 *
 * Idempotent by natural key (organizationId + species + name, the same unique
 * constraint the table enforces) — re-running never duplicates a breed.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { DEFAULT_ANIMAL_BREEDS } from '../src/modules/animals/animal-breeds.catalog';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });

  const prisma = app.get(PrismaService);

  try {
    const organizations = await prisma.organization.findMany({ select: { id: true, name: true } });
    let created = 0;

    for (const org of organizations) {
      // `withOrgContext` sets `app.current_org_id` for the duration of this
      // transaction — required for the insert to pass `animal_breeds`' RLS
      // WITH CHECK (the app role is FORCE-RLS'd, no bypass).
      await prisma.withOrgContext(org.id, async (tx) => {
        const existingRows = await tx.animalBreed.findMany({ where: { organizationId: org.id } });
        const existingKeys = new Set(existingRows.map((b) => `${b.species}::${b.name}`));

        for (const breed of DEFAULT_ANIMAL_BREEDS) {
          const key = `${breed.species}::${breed.name}`;
          if (existingKeys.has(key)) {
            continue;
          }
          await tx.animalBreed.create({
            data: { organizationId: org.id, species: breed.species, name: breed.name },
          });
          created += 1;
        }
      });
      console.log(`[seed:breeds] ${org.name}: catálogo verificado.`);
    }

    console.log(
      `[seed:breeds] Listo. ${created} razas nuevas insertadas en ${organizations.length} organizaciones.`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error('[seed:breeds] Error:', error);
  process.exit(1);
});

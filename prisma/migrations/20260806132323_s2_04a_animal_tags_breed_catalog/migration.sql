-- S2-04A: personality tags on `animals` + preload the common breed catalog for
-- every EXISTING organization (new organizations get the same catalog at
-- registration time — see AuthService.register). `animal_breeds` stays
-- tenant-scoped (RLS, `@@unique([organization_id, species, name])`); this is a
-- one-time backfill, not a shared/global table, so the multi-tenant invariant
-- (RLS on every business table) is untouched.
--
-- NOTE: `prisma migrate dev --create-only` also produced a large batch of
-- spurious `DROP CONSTRAINT` statements for FKs that are hand-added in SQL
-- (never modeled as Prisma @relation, per each module's boundary comments) —
-- expected drift given that pattern, NOT a real schema change. Removed by hand;
-- this file only contains the two changes this task actually makes.

-- AlterTable
ALTER TABLE "animals" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- ============================================================================
-- Backfill: preload DEFAULT_ANIMAL_BREEDS (animal-breeds.catalog.ts) for every
-- organization that already exists. `animal_breeds` is FORCE RLS (T-104), so a
-- cross-tenant bulk INSERT needs RLS off for the duration of this statement —
-- restored immediately after. ON CONFLICT is a no-op safety net (a fresh org
-- can't already have these rows; kept for idempotent re-runs of this file).
-- ============================================================================

ALTER TABLE "animal_breeds" DISABLE ROW LEVEL SECURITY;

INSERT INTO "animal_breeds" ("id", "organization_id", "species", "name", "created_at")
SELECT gen_random_uuid(), o."id", b."species", b."name", CURRENT_TIMESTAMP
FROM "organizations" o
CROSS JOIN (
  VALUES
    ('dog', 'Labrador Retriever'),
    ('dog', 'Golden Retriever'),
    ('dog', 'Pastor Alemán'),
    ('dog', 'Bulldog Francés'),
    ('dog', 'Bulldog Inglés'),
    ('dog', 'Poodle'),
    ('dog', 'Beagle'),
    ('dog', 'Rottweiler'),
    ('dog', 'Yorkshire Terrier'),
    ('dog', 'Boxer'),
    ('dog', 'Dachshund (Salchicha)'),
    ('dog', 'Husky Siberiano'),
    ('dog', 'Doberman'),
    ('dog', 'Gran Danés'),
    ('dog', 'Chihuahua'),
    ('dog', 'Shih Tzu'),
    ('dog', 'Schnauzer Miniatura'),
    ('dog', 'Pomerania'),
    ('dog', 'Border Collie'),
    ('dog', 'Cocker Spaniel'),
    ('dog', 'Pitbull'),
    ('dog', 'Bichón Maltés'),
    ('dog', 'San Bernardo'),
    ('dog', 'Akita Inu'),
    ('dog', 'Dálmata'),
    ('dog', 'Pug (Carlino)'),
    ('dog', 'Jack Russell Terrier'),
    ('dog', 'Shar Pei'),
    ('dog', 'Samoyedo'),
    ('dog', 'Weimaraner'),
    ('dog', 'Mestizo / Criollo'),
    ('cat', 'Persa'),
    ('cat', 'Siamés'),
    ('cat', 'Maine Coon'),
    ('cat', 'Bengalí'),
    ('cat', 'Ragdoll'),
    ('cat', 'Británico de Pelo Corto'),
    ('cat', 'Sphynx'),
    ('cat', 'Abisinio'),
    ('cat', 'Scottish Fold'),
    ('cat', 'Angora Turco'),
    ('cat', 'Ruso Azul'),
    ('cat', 'Birmano'),
    ('cat', 'Bombay'),
    ('cat', 'Exótico de Pelo Corto'),
    ('cat', 'Mestizo / Criollo')
) AS b("species", "name")
ON CONFLICT ("organization_id", "species", "name") DO NOTHING;

ALTER TABLE "animal_breeds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "animal_breeds" FORCE ROW LEVEL SECURITY;

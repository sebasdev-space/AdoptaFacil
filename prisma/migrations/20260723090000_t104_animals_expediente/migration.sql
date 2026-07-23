-- CreateTable
CREATE TABLE "animal_breeds" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "species" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "animal_breeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "sex" TEXT NOT NULL DEFAULT 'unknown',
    "size" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'available',
    "breed_id" UUID,
    "custom_breed" TEXT,
    "birth_date" TIMESTAMP(3),
    "approximate_age_months" INTEGER,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "animals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animal_photos" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "storage_ref" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "animal_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "animal_breeds_organization_id_idx" ON "animal_breeds"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "animal_breeds_organization_id_species_name_key" ON "animal_breeds"("organization_id", "species", "name");

-- CreateIndex
CREATE INDEX "animals_organization_id_idx" ON "animals"("organization_id");

-- CreateIndex
CREATE INDEX "animals_organization_id_is_active_idx" ON "animals"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "animal_photos_organization_id_idx" ON "animal_photos"("organization_id");

-- CreateIndex
CREATE INDEX "animal_photos_animal_id_idx" ON "animal_photos"("animal_id");

-- AddForeignKey (intra-module, modeled in Prisma)
ALTER TABLE "animals" ADD CONSTRAINT "animals_breed_id_fkey" FOREIGN KEY ("breed_id") REFERENCES "animal_breeds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey (intra-module, modeled in Prisma)
ALTER TABLE "animal_photos" ADD CONSTRAINT "animal_photos_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey to organizations (declared in SQL, NOT as a Prisma @relation, to
-- avoid editing the Organization model in org.prisma — another owner's file).
ALTER TABLE "animal_breeds" ADD CONSTRAINT "animal_breeds_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "animals" ADD CONSTRAINT "animals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "animal_photos" ADD CONSTRAINT "animal_photos_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ROW-LEVEL SECURITY (RNF03) — M03 animal record (T-104). animals, animal_photos
-- and animal_breeds are tenant-scoped business data: an org only ever reads/edits
-- its OWN rows. Mirrors the canonical _rls_probe pattern.
-- ============================================================================

ALTER TABLE "animal_breeds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "animal_breeds" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "animal_breeds"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "animals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "animals" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "animals"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "animal_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "animal_photos" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "animal_photos"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- ============================================================================
-- LEAST-PRIVILEGE GRANTS + SOFT-DELETE ENFORCEMENT (RF07, Ley 1774). The animal
-- record is NEVER physically deleted — the app role loses DELETE/TRUNCATE and
-- triggers reject removal for EVERY role (incl. superuser, normal path).
-- Deactivation is a soft toggle on is_active (a normal UPDATE). Breeds are
-- create+read only; photos allow removal/replacement.
-- ============================================================================

GRANT SELECT, INSERT ON "animal_breeds" TO adoptafacil_app;

GRANT SELECT, INSERT, UPDATE ON "animals" TO adoptafacil_app;
REVOKE DELETE, TRUNCATE ON "animals" FROM adoptafacil_app;

GRANT SELECT, INSERT, DELETE ON "animal_photos" TO adoptafacil_app;

CREATE OR REPLACE FUNCTION animals_reject_removal() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'animals is soft-delete only: % is not permitted — deactivate (is_active=false) instead (RF07)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER animals_no_delete
  BEFORE DELETE ON "animals"
  FOR EACH ROW EXECUTE FUNCTION animals_reject_removal();

CREATE TRIGGER animals_no_truncate
  BEFORE TRUNCATE ON "animals"
  FOR EACH STATEMENT EXECUTE FUNCTION animals_reject_removal();

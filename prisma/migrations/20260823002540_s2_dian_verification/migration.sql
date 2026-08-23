-- NOTE (mismo patrón que otras migraciones recientes, ver t_portal_subdomain_
-- resolution / t_reconciliation_report / s1_legal_representative): el diff de
-- Prisma propuso además DROP de ~24 foreign keys añadidas a mano en
-- migraciones anteriores y un ALTER de platform_settings.updated_at sin
-- relación con esta tarea. Ninguno de los dos va aquí.

-- AlterTable
ALTER TABLE "organization_profiles" ADD COLUMN     "dian_verification" JSONB;

-- CreateTable
CREATE TABLE "dian_verification_attempts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "result" TEXT NOT NULL,
    "triggered_by" TEXT NOT NULL,
    "actor_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dian_verification_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dian_verification_attempts_organization_id_idx" ON "dian_verification_attempts"("organization_id");

-- CreateIndex
CREATE INDEX "dian_verification_attempts_organization_id_created_at_idx" ON "dian_verification_attempts"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "dian_verification_attempts" ADD CONSTRAINT "dian_verification_attempts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- DIAN VERIFICATION ATTEMPTS (M01, S-2, RF02 relacionado / RNF07) —
-- tenant-isolated (RNF03) AND append-only, exactly like formalization_transitions.
-- ============================================================================

-- 1. Tenant RLS (same canonical policy as every other business table).
ALTER TABLE "dian_verification_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dian_verification_attempts" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "dian_verification_attempts"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- 2. Append-only: the app role may only read + insert.
GRANT SELECT, INSERT ON "dian_verification_attempts" TO adoptafacil_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "dian_verification_attempts" FROM adoptafacil_app;

-- 3. Immutability for EVERY role (incl. superuser, normal path): reject any
--    UPDATE/DELETE/TRUNCATE. Reuses the same rejection style as
--    formalization_transitions / legal_representatives.
CREATE OR REPLACE FUNCTION dian_verification_attempts_reject_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'dian_verification_attempts is append-only: % is not permitted (RNF07)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER dian_verification_attempts_no_update
  BEFORE UPDATE ON "dian_verification_attempts"
  FOR EACH ROW EXECUTE FUNCTION dian_verification_attempts_reject_mutation();

CREATE TRIGGER dian_verification_attempts_no_delete
  BEFORE DELETE ON "dian_verification_attempts"
  FOR EACH ROW EXECUTE FUNCTION dian_verification_attempts_reject_mutation();

CREATE TRIGGER dian_verification_attempts_no_truncate
  BEFORE TRUNCATE ON "dian_verification_attempts"
  FOR EACH STATEMENT EXECUTE FUNCTION dian_verification_attempts_reject_mutation();

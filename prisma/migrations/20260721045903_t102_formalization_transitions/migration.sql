-- CreateTable
CREATE TABLE "formalization_transitions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "from_state" TEXT NOT NULL,
    "to_state" TEXT NOT NULL,
    "actor_user_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "formalization_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "formalization_transitions_organization_id_idx" ON "formalization_transitions"("organization_id");

-- CreateIndex
CREATE INDEX "formalization_transitions_organization_id_created_at_idx" ON "formalization_transitions"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "formalization_transitions" ADD CONSTRAINT "formalization_transitions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- FORMALIZATION HISTORY (M01, RF02) — tenant-isolated (RNF03) AND append-only.
-- Each row is the immutable business record of one state change, kept forever.
-- ============================================================================

-- 1. Tenant RLS (same canonical policy as the other business tables).
ALTER TABLE "formalization_transitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "formalization_transitions" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "formalization_transitions"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- 2. Append-only: the app role may only read + insert.
GRANT SELECT, INSERT ON "formalization_transitions" TO adoptafacil_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "formalization_transitions" FROM adoptafacil_app;

-- 3. Immutability for EVERY role (incl. superuser, normal path): reject any
--    UPDATE/DELETE/TRUNCATE. Reuses the same rejection style as audit_logs.
CREATE OR REPLACE FUNCTION formalization_transitions_reject_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'formalization_transitions is append-only: % is not permitted (RF02)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER formalization_transitions_no_update
  BEFORE UPDATE ON "formalization_transitions"
  FOR EACH ROW EXECUTE FUNCTION formalization_transitions_reject_mutation();

CREATE TRIGGER formalization_transitions_no_delete
  BEFORE DELETE ON "formalization_transitions"
  FOR EACH ROW EXECUTE FUNCTION formalization_transitions_reject_mutation();

CREATE TRIGGER formalization_transitions_no_truncate
  BEFORE TRUNCATE ON "formalization_transitions"
  FOR EACH STATEMENT EXECUTE FUNCTION formalization_transitions_reject_mutation();

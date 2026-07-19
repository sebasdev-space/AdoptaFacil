-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_idx" ON "audit_logs"("organization_id");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_entity_type_entity_id_idx" ON "audit_logs"("organization_id", "entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- APPEND-ONLY AUDIT (RNF04) — immutable, tenant-isolated. Prisma models none of
-- this, so it is maintained by hand.
--
-- Tenant isolation (RNF03): organization_id + RLS ENABLE/FORCE + tenant_isolation
-- policy, identical to the other business tables — an event of Org A is invisible
-- under Org B's context.
--
-- Immutability ("inmodificable incluso por SuperAdmin"):
--   1. The app role gets only SELECT + INSERT (never UPDATE/DELETE).
--   2. A trigger rejects any UPDATE/DELETE/TRUNCATE on the table for EVERY role —
--      row triggers fire regardless of the caller, so a superuser cannot alter or
--      remove rows through the normal SQL path either.
-- Retention (10 years): append-only, nothing is purged in Ola 0; created_at is
-- UTC so retention can be computed later.
-- ============================================================================

-- 1. Tenant RLS.
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "audit_logs"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- 2. Least privilege: append-only for the application role.
GRANT SELECT, INSERT ON "audit_logs" TO adoptafacil_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_logs" FROM adoptafacil_app;

-- 3. Database-enforced immutability for ALL roles (including superuser, normal
--    path). SECURITY DEFINER is unnecessary; triggers fire for every caller.
CREATE OR REPLACE FUNCTION audit_logs_reject_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is not permitted (RNF04)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_reject_mutation();

CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_reject_mutation();

CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_reject_mutation();

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_rls_probe" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "payload" TEXT NOT NULL,

    CONSTRAINT "_rls_probe_pkey" PRIMARY KEY ("id")
);

-- ============================================================================
-- CANONICAL RLS REFERENCE (RNF03). Prisma does not model RLS, so this SQL is
-- maintained by hand. Superusers bypass RLS and owners bypass it without FORCE,
-- so the app connects as a NON-SUPERUSER role (adoptafacil_app), created below.
-- Mirror of prisma/rls-policy.reference.sql.
-- ============================================================================

-- 1. Enable + FORCE Row-Level Security on the reference table.
ALTER TABLE "_rls_probe" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_rls_probe" FORCE ROW LEVEL SECURITY;

-- 2. Tenant isolation policy. A row is visible/insertable only when its
--    organization_id equals app.current_org_id set for the current transaction.
--    current_setting(..., true) returns NULL when unset => zero rows visible.
-- NULLIF(..., '') is required: once app.current_org_id has been set in a session
-- (even via SET LOCAL), later reads return '' rather than NULL; '' ::uuid errors.
-- Mapping '' -> NULL yields zero visible rows instead of a 22P02 cast error.
CREATE POLICY tenant_isolation ON "_rls_probe"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- 3. Application role (idempotent). NOSUPERUSER + NOBYPASSRLS so RLS applies.
--    Password is a non-secret local/CI dev value; production provisions its own.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'adoptafacil_app') THEN
    CREATE ROLE adoptafacil_app LOGIN PASSWORD 'adoptafacil_app' NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

-- 4. Least-privilege grants for the app role.
GRANT USAGE ON SCHEMA public TO adoptafacil_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "organizations" TO adoptafacil_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "_rls_probe" TO adoptafacil_app;

-- CreateTable
CREATE TABLE "org_members" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "org_members_organization_id_idx" ON "org_members"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_members_organization_id_email_key" ON "org_members"("organization_id", "email");

-- AddForeignKey
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ROW-LEVEL SECURITY (RNF03) — first REAL business table. Prisma does not model
-- RLS, so this SQL is maintained by hand, mirroring the canonical _rls_probe
-- reference (see prisma/rls-policy.reference.sql). The adoptafacil_app role
-- already exists (created by the initial migration); here we only protect the
-- new table and grant the app role least-privilege access to it.
-- ============================================================================

-- 1. Enable + FORCE Row-Level Security (FORCE so even the table owner is subject
--    to the policy — only a superuser bypasses it, and the app is not one).
ALTER TABLE "org_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "org_members" FORCE ROW LEVEL SECURITY;

-- 2. Tenant isolation policy — identical semantics to _rls_probe. A row is
--    visible/insertable only when its organization_id equals the transaction's
--    app.current_org_id. NULLIF(..., '') maps the "set-but-empty" case to NULL
--    so an unset context yields zero rows instead of a 22P02 cast error.
CREATE POLICY tenant_isolation ON "org_members"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- 3. Least-privilege grant for the application role.
GRANT SELECT, INSERT, UPDATE, DELETE ON "org_members" TO adoptafacil_app;

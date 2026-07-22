-- CreateTable
CREATE TABLE "portal_themes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "tokens" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_themes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portal_themes_organization_id_key" ON "portal_themes"("organization_id");

-- CreateIndex
CREATE INDEX "portal_themes_organization_id_idx" ON "portal_themes"("organization_id");

-- AddForeignKey
-- Boundary note (M14→M01): the Prisma model in portals.prisma deliberately omits
-- the relation to `Organization` (org.prisma, owned by @sebastian) to avoid
-- editing that file; the FK + cascade is added here in raw SQL instead.
ALTER TABLE "portal_themes" ADD CONSTRAINT "portal_themes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ROW-LEVEL SECURITY (RNF03) — M14 portal theme (T-027). The theme is
-- tenant-scoped business data: an organization only ever reads/edits its own
-- row. Mirrors the canonical _rls_probe pattern (see org.prisma).
-- ============================================================================

ALTER TABLE "portal_themes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "portal_themes" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "portal_themes"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "portal_themes" TO adoptafacil_app;

-- ============================================================================
-- PUBLIC PORTAL READ (M14) — controlled exception to RLS, same pattern as
-- `organization_public(slug)`. The public visitor has NO tenant context, so a
-- normal app-role read of the RLS-protected theme would return zero rows.
-- Instead of evading RLS with a privileged SELECT, this SECURITY DEFINER
-- function returns ONLY the (public-by-nature) brand tokens for one org, looked
-- up by its profile slug. The stored tokens are already the validated safe
-- subset, so nothing sensitive can be emitted.
-- ============================================================================

CREATE OR REPLACE FUNCTION organization_portal_theme(p_slug TEXT)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(t.tokens, '{}'::jsonb)
  FROM organization_profiles p
  JOIN portal_themes t ON t.organization_id = p.organization_id
  WHERE p.slug = p_slug;
$$;

-- Least privilege: only the app role may execute it (not PUBLIC).
REVOKE ALL ON FUNCTION organization_portal_theme(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION organization_portal_theme(TEXT) TO adoptafacil_app;

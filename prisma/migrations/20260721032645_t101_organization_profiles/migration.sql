-- CreateTable
CREATE TABLE "organization_profiles" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "nit" TEXT,
    "legal_name" TEXT,
    "description" TEXT,
    "logo_url" TEXT,
    "cover_photos" TEXT[],
    "whatsapp" TEXT,
    "contact_email" TEXT,
    "phone" TEXT,
    "location" JSONB,
    "social_links" JSONB,
    "subdomain" TEXT,
    "slug" TEXT,
    "formalization_state" TEXT NOT NULL DEFAULT 'informal',
    "rte_vigente" BOOLEAN NOT NULL DEFAULT false,
    "verification_level" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_profiles_organization_id_key" ON "organization_profiles"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_profiles_subdomain_key" ON "organization_profiles"("subdomain");

-- CreateIndex
CREATE UNIQUE INDEX "organization_profiles_slug_key" ON "organization_profiles"("slug");

-- CreateIndex
CREATE INDEX "organization_profiles_organization_id_idx" ON "organization_profiles"("organization_id");

-- AddForeignKey
ALTER TABLE "organization_profiles" ADD CONSTRAINT "organization_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ROW-LEVEL SECURITY (RNF03) — M01 organization profile (T-101). The profile is
-- tenant-scoped business data: an organization only ever reads/edits its own
-- row. Mirrors the canonical _rls_probe pattern.
-- ============================================================================

ALTER TABLE "organization_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_profiles" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "organization_profiles"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "organization_profiles" TO adoptafacil_app;

-- ============================================================================
-- PUBLIC PORTAL READ (M14) — controlled exception to RLS. The public visitor
-- has NO tenant context, so a normal app-role read of the RLS-protected profile
-- would return zero rows. Instead of evading RLS with a privileged `SELECT *`,
-- this SECURITY DEFINER function returns ONLY the public columns for one org,
-- looked up by slug. Business rules enforced here:
--   - NIT is exposed ONLY when the org is formalized (Formalizada or higher).
--   - phone and legal_name (razón social) are NEVER exposed publicly.
-- The function runs as its owner (the migration superuser), so it can read
-- across tenants, but it can only ever emit the columns hard-coded below.
-- ============================================================================

CREATE OR REPLACE FUNCTION organization_public(p_slug TEXT)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', o.id,
    'name', o.name,
    'slug', p.slug,
    'subdomain', p.subdomain,
    'description', p.description,
    'logoUrl', p.logo_url,
    'coverPhotos', to_jsonb(COALESCE(p.cover_photos, ARRAY[]::text[])),
    'location', p.location,
    'socialLinks', p.social_links,
    'whatsapp', p.whatsapp,
    'contactEmail', p.contact_email,
    'formalizationState', p.formalization_state,
    'rteVigente', p.rte_vigente,
    'verificationLevel', p.verification_level,
    -- NIT (transparency) only once formalized; NULL otherwise. Never phone/legal_name.
    'nit', CASE
             WHEN p.formalization_state IN ('formalizada', 'esal', 'esal_rte') THEN p.nit
             ELSE NULL
           END
  )
  FROM organization_profiles p
  JOIN organizations o ON o.id = p.organization_id
  WHERE p.slug = p_slug;
$$;

-- Least privilege: only the app role may execute it (not PUBLIC).
REVOKE ALL ON FUNCTION organization_public(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION organization_public(TEXT) TO adoptafacil_app;

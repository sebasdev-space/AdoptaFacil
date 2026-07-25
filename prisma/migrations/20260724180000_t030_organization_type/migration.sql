-- ============================================================================
-- ORGANIZATION TYPE + PLATFORM POLICY (M01, RF01, T-030). Adds the org's
-- legal/organizational type and a SINGLE platform-level policy that decides
-- whether the public portal exposes that type. One migration; no new tenant
-- tables under RLS beyond the existing pattern.
-- ============================================================================

-- 1. Per-org organizational type (nullable; Owner/Administrator set it via the
--    profile update). Public exposure is gated by the platform policy below.
ALTER TABLE "organization_profiles" ADD COLUMN "organization_type" TEXT;

-- 2. Platform-wide settings SINGLETON. NOT tenant data → intentionally NOT under
--    RLS (like the `organizations` registry). Only the platform-gated controller
--    writes it; the app role gets SELECT/INSERT/UPDATE (never DELETE).
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "show_organization_type" TEXT NOT NULL DEFAULT 'formalized_only',
    "updated_by_user_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- Seed the singleton row with the default policy (idempotent).
INSERT INTO "platform_settings" ("id", "show_organization_type", "updated_at")
VALUES ('global', 'formalized_only', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON "platform_settings" TO adoptafacil_app;
REVOKE DELETE, TRUNCATE ON "platform_settings" FROM adoptafacil_app;

-- ============================================================================
-- PUBLIC PORTAL READ — enrich organization_public(slug) to expose
-- organizationType subject to the platform policy:
--   * show_organization_type = 'all'             → always expose it.
--   * show_organization_type = 'formalized_only' → only for Formalizada/ESAL.
-- Still SECURITY DEFINER + returns ONLY public columns (never phone/legal_name).
-- The function reads the platform singleton (global config, not tenant data).
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
           END,
    -- organizationType gated by the platform policy (T-030): 'all' → always;
    -- 'formalized_only' (default) → only for Formalizada/ESAL orgs.
    'organizationType', CASE
             WHEN COALESCE(
                    (SELECT show_organization_type FROM platform_settings WHERE id = 'global'),
                    'formalized_only'
                  ) = 'all'
                  OR p.formalization_state IN ('formalizada', 'esal', 'esal_rte')
             THEN p.organization_type
             ELSE NULL
           END
  )
  FROM organization_profiles p
  JOIN organizations o ON o.id = p.organization_id
  WHERE p.slug = p_slug;
$$;

REVOKE ALL ON FUNCTION organization_public(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION organization_public(TEXT) TO adoptafacil_app;

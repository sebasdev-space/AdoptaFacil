-- S2-PORTAL: personalización avanzada del portal público.
--
-- NOTE (mismo patrón que T-028a/b/c, T-050, T-053...): el diff de Prisma
-- propuso además DROP de ~24 foreign keys añadidas a mano en migraciones
-- anteriores (org.prisma no modela esas relaciones — "otro owner's file").
-- Esos DROP NO van aquí: esta migración SOLO agrega las 4 columnas nuevas.
-- También propuso un ALTER a platform_settings.updated_at sin relación con
-- esta tarea; tampoco va aquí.

-- AlterTable: organization_profiles (contenido de "Nosotros" / contacto extendido)
ALTER TABLE "organization_profiles" ADD COLUMN     "about_us" TEXT,
ADD COLUMN     "extended_contact" JSONB;

-- AlterTable: portal_themes (layout: posición del logo / sidebar de redes)
ALTER TABLE "portal_themes" ADD COLUMN     "logo_position" TEXT DEFAULT 'left',
ADD COLUMN     "social_nav_position" TEXT DEFAULT 'right';

-- ============================================================================
-- Exponer los campos nuevos en las funciones SECURITY DEFINER públicas
-- existentes (S2-PORTAL) — sin esto, "GET /public/organizations/:slug" y
-- "GET /public/organizations/:slug/theme" seguirían devolviendo solo los
-- campos de antes (Condición de parada #2 del spec: el theme público ya vive
-- en su propia función, `organization_portal_theme`, distinta de
-- `organization_public`).
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
           END,
    -- S2-PORTAL: contenido de las nuevas tabs "Nosotros"/"Información". NULL
    -- (u objeto vacío) ⇒ el frontend oculta la tab correspondiente.
    'aboutUs', p.about_us,
    'extendedContact', p.extended_contact
  )
  FROM organization_profiles p
  JOIN organizations o ON o.id = p.organization_id
  WHERE p.slug = p_slug;
$$;

CREATE OR REPLACE FUNCTION organization_portal_theme(p_slug TEXT)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'tokens', COALESCE(t.tokens, '{}'::jsonb),
    -- S2-PORTAL: layout público (posición del logo / sidebar de redes).
    'logoPosition', COALESCE(t.logo_position, 'left'),
    'socialNavPosition', COALESCE(t.social_nav_position, 'right')
  )
  FROM organization_profiles p
  JOIN portal_themes t ON t.organization_id = p.organization_id
  WHERE p.slug = p_slug;
$$;

-- M14: resolve a real portal subdomain (`<subdomain>.adoptafacil.com`) to its
-- organization slug. Minimal public surface — returns ONLY the slug, nothing
-- else — so the frontend can reuse every existing slug-keyed public endpoint
-- (`organization_public`, `organization_portal_theme`, etc.) unchanged once
-- resolved, instead of duplicating their public projection for a second key.
--
-- NOTE (same pattern as t_portal_personalization_v2): the Prisma diff for this
-- migration proposed dropping ~24 hand-added foreign keys (added by hand in
-- earlier migrations; org.prisma/animals.prisma/etc. do not model those
-- relations) plus an unrelated `platform_settings.updated_at` default change.
-- None of that belongs here — this migration ONLY adds the function below.
CREATE OR REPLACE FUNCTION organization_slug_by_subdomain(p_subdomain TEXT)
  RETURNS TEXT
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT slug
  FROM organization_profiles
  WHERE subdomain = p_subdomain;
$$;

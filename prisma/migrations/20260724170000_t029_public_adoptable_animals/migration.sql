-- ============================================================================
-- PUBLIC ADOPTION CATALOG (M03/portal, RF07 public projection, T-029). A visitor
-- has NO session/tenant context, so a normal app-role read of the RLS-protected
-- `animals` table returns zero rows. Instead of evading RLS with a privileged
-- SELECT, this bounded SECURITY DEFINER function (runs as its owner) returns ONLY
-- the public AnimalSummary columns for the ADOPTABLE animals of ONE organization,
-- looked up by its public portal slug. Mirrors the organization_public(slug)
-- pattern (T-101).
--
-- "Adoptable" (fixed by Sebastián) = is_active = true AND status = 'available'
-- (the published adoption status; there is no separate "published" flag — an
-- inactive record is a hidden/draft one, so is_active carries "published").
--
-- NEVER exposes: clinical record, reminders, documents, or any internal/PII field
-- beyond what organization_public already publishes. Pagination is mandatory and
-- server-capped (limit clamped to 1..50). This migration creates ONLY the
-- function — no tables.
-- ============================================================================
CREATE OR REPLACE FUNCTION public_org_adoptable_animals(
  p_slug TEXT,
  p_limit INTEGER,
  p_offset INTEGER,
  p_species TEXT DEFAULT NULL
)
  RETURNS JSONB
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_org UUID;
  v_total BIGINT;
  v_items JSONB;
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  -- Resolve the org by its PUBLIC portal slug. Unknown slug (or no public portal)
  -- → NULL, which the controller maps to 404 without revealing private data.
  SELECT organization_id INTO v_org FROM organization_profiles WHERE slug = p_slug;
  IF v_org IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_total
  FROM animals a
  WHERE a.organization_id = v_org
    AND a.is_active = TRUE
    AND a.status = 'available'
    AND (p_species IS NULL OR a.species = p_species);

  SELECT COALESCE(jsonb_agg(row.obj ORDER BY row.created_at DESC), '[]'::jsonb) INTO v_items
  FROM (
    SELECT
      jsonb_build_object(
        'id', a.id,
        'organizationId', a.organization_id,
        'name', a.name,
        'species', a.species,
        'sex', a.sex,
        'size', a.size,
        'status', a.status,
        'breed', COALESCE(b.name, a.custom_breed),
        'primaryPhotoRef', (
          SELECT p.storage_ref
          FROM animal_photos p
          WHERE p.animal_id = a.id
          ORDER BY p."order" ASC, p.created_at ASC
          LIMIT 1
        ),
        -- Raw age inputs for the API to DERIVE computedAge; never surfaced as DOB.
        'birthDate', a.birth_date,
        'approximateAgeMonths', a.approximate_age_months
      ) AS obj,
      a.created_at AS created_at
    FROM animals a
    LEFT JOIN animal_breeds b ON b.id = a.breed_id
    WHERE a.organization_id = v_org
      AND a.is_active = TRUE
      AND a.status = 'available'
      AND (p_species IS NULL OR a.species = p_species)
    ORDER BY a.created_at DESC
    LIMIT v_limit OFFSET v_offset
  ) row;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
END;
$$;

-- Least privilege: only the app role may execute it (not PUBLIC).
REVOKE ALL ON FUNCTION public_org_adoptable_animals(TEXT, INTEGER, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_org_adoptable_animals(TEXT, INTEGER, INTEGER, TEXT) TO adoptafacil_app;

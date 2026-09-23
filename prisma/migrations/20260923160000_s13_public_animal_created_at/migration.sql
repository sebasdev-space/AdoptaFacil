-- Catálogo público del portal (M14, rediseño visual) — expone `createdAt` en
-- `public_org_adoptable_animals()` (T-029) para la insignia "Nuevo" y el
-- ordenamiento "Más recientes/antiguos" del nuevo catálogo. `a.created_at` ya
-- se seleccionaba internamente (para el ORDER BY); solo faltaba incluirlo en
-- el objeto JSON devuelto. Firma sin cambios (RETURNS JSONB) → CREATE OR
-- REPLACE es seguro, no hace falta DROP FUNCTION.

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
        'approximateAgeMonths', a.approximate_age_months,
        'createdAt', a.created_at
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

REVOKE ALL ON FUNCTION public_org_adoptable_animals(TEXT, INTEGER, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_org_adoptable_animals(TEXT, INTEGER, INTEGER, TEXT) TO adoptafacil_app;

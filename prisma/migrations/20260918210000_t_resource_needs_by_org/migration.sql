-- ============================================================================
-- M14/M09 — cierra el hallazgo de QA: el portal público de una organización
-- (`/o/:slug`) no tenía forma de acotar el catálogo público de necesidades
-- (M09) a una sola organización, así que la sección "Necesita hoy" quedaba
-- sin poder cablearse (mismo hueco que ya se cerró para el marketplace en
-- T-MKT-PORTAL-1: `public_products` ganó un filtro `p_organization_id`).
--
-- Dato YA público (ninguna columna nueva se expone; sigue siendo el mismo
-- SECURITY DEFINER acotado). Se reemplaza la firma de 2 parámetros por una de
-- 3 (limit, offset, organizationId) — nada más en el repo llama a la función
-- de 2 parámetros (único caller: PublicResourceNeedsService), así que se
-- elimina en vez de dejar un overload muerto.
-- ============================================================================

DROP FUNCTION IF EXISTS public_resource_needs(INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public_resource_needs(
  p_limit INTEGER,
  p_offset INTEGER,
  p_organization_id UUID
)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'items', COALESCE((SELECT jsonb_agg(item ORDER BY (item->>'createdAt') DESC) FROM (
      SELECT jsonb_build_object(
        'id', n.id,
        'organizationId', n.organization_id,
        'organizationName', o.name,
        'title', n.title,
        'description', n.description,
        'category', n.category,
        'quantityNeeded', n.quantity_needed,
        'unit', n.unit,
        'quantityFulfilled', n.quantity_fulfilled,
        'status', n.status,
        'createdAt', to_char(n.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) AS item
      FROM "resource_needs" n
      JOIN "organizations" o ON o.id = n.organization_id
      WHERE n.status IN ('needed', 'partially_fulfilled')
        AND (p_organization_id IS NULL OR n.organization_id = p_organization_id)
      ORDER BY n.created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
      OFFSET GREATEST(COALESCE(p_offset, 0), 0)
    ) page), '[]'::jsonb),
    'total', (
      SELECT count(*) FROM "resource_needs"
      WHERE "status" IN ('needed', 'partially_fulfilled')
        AND (p_organization_id IS NULL OR "organization_id" = p_organization_id)
    )
  );
$$;

REVOKE ALL ON FUNCTION public_resource_needs(INTEGER, INTEGER, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_resource_needs(INTEGER, INTEGER, UUID) TO adoptafacil_app;

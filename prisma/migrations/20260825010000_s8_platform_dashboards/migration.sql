-- M13 · dashboards por audiencia (RF24, Ola 3, S-8). Este spec cubre las
-- audiencias PlatformAdmin y PlatformSuperAdmin (la audiencia Organización ya
-- está resuelta en S2-08, `GET /org/summary`). NO agrega ninguna tabla nueva —
-- solo funciones de SOLO LECTURA, cross-tenant, sobre tablas YA EXISTENTES de
-- otros módulos (donations, animals, adoption_requests, campaigns,
-- sponsorships, organizations, organization_profiles), siguiendo EXACTAMENTE
-- el mismo patrón SECURITY DEFINER ya usado por organization_public(),
-- platform_document_queue(), platform_review_queue(), etc. Ninguna de estas
-- funciones recalcula una fórmula distinta a la ya usada en cada módulo:
--   - platform_financial_summary(): suma el campo `breakdown` (JSON) que
--     `computeBreakdown()` (M15, apps/api/src/modules/payments/payment-breakdown.ts)
--     ya calculó y persistió por donación al momento de crearla — nunca se
--     recalcula aquí, solo se SUMA lo ya guardado.
--   - platform_business_counts(): reutiliza EXACTAMENTE los mismos filtros de
--     "activo"/"total" que ya usan animals (S2-08), campaigns
--     (public-campaigns.service.ts), sponsorships (S2-08) y adoption_requests
--     (nuevo conteo "totalAdoptions" = status 'approved', por analogía directa
--     con el estado terminal ya definido en adoption-status.ts — no existía
--     ningún conteo previo de este dato específico en ningún módulo).
--   - platform_organizations_by_verification_level() / _by_department():
--     leen organization_profiles.verification_level / .location, ya
--     calculados por documents.service.ts (S1-05) y por el formulario de
--     perfil de organización respectivamente — nunca recalculados aquí.
--
-- Decisión de alcance deliberada (señalada en el PR): platform_financial_summary
-- suma TODAS las donaciones aprobadas sin filtrar por concept_kind (a
-- diferencia de S2-08, que excluye concept_kind='campaign' para no duplicar
-- contra Campaign.raisedAmount DENTRO del resumen de una misma organización).
-- Aquí no hay ese riesgo de doble conteo: este dashboard no muestra también
-- una suma de raisedAmount de campañas, solo un conteo de campañas activas.

-- Total financiero de la plataforma (bruto/comisión-plataforma/comisión-
-- pasarela/neto), sumando `donations.breakdown` de TODAS las organizaciones
-- (solo donaciones 'approved'). IVA de cada comisión se suma dentro de su
-- propio bucket (platformFee+platformIva, gatewayFee+gatewayIva) para que
-- gross_total = platform_fee_total + gateway_fee_total + net_total siga
-- siendo una identidad verificable a nivel de plataforma, igual que ya lo es
-- por donación individual (computeBreakdown(), invariante documentada ahí).
CREATE OR REPLACE FUNCTION platform_financial_summary()
  RETURNS TABLE(
    gross_total NUMERIC,
    platform_fee_total NUMERIC,
    gateway_fee_total NUMERIC,
    net_total NUMERIC
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT
    COALESCE(SUM((breakdown->>'gross')::numeric), 0) AS gross_total,
    COALESCE(
      SUM((breakdown->>'platformFee')::numeric + (breakdown->>'platformIva')::numeric),
      0
    ) AS platform_fee_total,
    COALESCE(
      SUM((breakdown->>'gatewayFee')::numeric + (breakdown->>'gatewayIva')::numeric),
      0
    ) AS gateway_fee_total,
    COALESCE(SUM((breakdown->>'net')::numeric), 0) AS net_total
  FROM "donations"
  WHERE status = 'approved';
$$;

REVOKE ALL ON FUNCTION platform_financial_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_financial_summary() TO adoptafacil_app;

-- Indicadores de negocio a nivel de plataforma — cada uno reutiliza el MISMO
-- filtro de "activo"/estado terminal que ya usa su módulo dueño (ver
-- comentario superior); ninguno es un cálculo nuevo, solo sin el filtro de
-- organización que normalmente impone RLS.
CREATE OR REPLACE FUNCTION platform_business_counts()
  RETURNS TABLE(
    active_animals INTEGER,
    total_adoptions INTEGER,
    active_campaigns INTEGER,
    active_sponsorships INTEGER
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*)::integer FROM "animals" WHERE is_active = true AND status = 'available'),
    (SELECT COUNT(*)::integer FROM "adoption_requests" WHERE status = 'approved'),
    (SELECT COUNT(*)::integer FROM "campaigns" WHERE status = 'active'),
    (SELECT COUNT(*)::integer FROM "sponsorships" WHERE status = 'active');
$$;

REVOKE ALL ON FUNCTION platform_business_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_business_counts() TO adoptafacil_app;

-- Organizaciones por nivel de verificación (0 = ninguno, ya el valor por
-- defecto implícito cuando no hay `organization_profiles` row o su
-- `verification_level` es NULL) — mismo dato que ya expone
-- `GET /org/documents/verification` por organización individual.
CREATE OR REPLACE FUNCTION platform_organizations_by_verification_level()
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('level', level, 'count', cnt) ORDER BY level),
    '[]'::jsonb
  )
  FROM (
    SELECT COALESCE((p.verification_level->>'level')::int, 0) AS level, COUNT(*)::integer AS cnt
    FROM "organizations" o
    LEFT JOIN "organization_profiles" p ON p.organization_id = o.id
    GROUP BY 1
  ) x;
$$;

REVOKE ALL ON FUNCTION platform_organizations_by_verification_level() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_organizations_by_verification_level() TO adoptafacil_app;

-- Organizaciones por departamento — dato agregado simple (lista/gráfico de
-- barras), NO un mapa interactivo: el proyecto no tiene ningún activo
-- geográfico de Colombia (geojson/SVG/librería de mapas) en apps/web ni en
-- sus dependencias (inventario confirmado antes de escribir este spec) —
-- construir un mapa fiel sin ese activo es un esfuerzo de diseño mayor al
-- alcance de S-8 (TODO(client) si se requiere un mapa interactivo real).
-- `department` es texto libre (`OrganizationLocation.department`, sin
-- vocabulario cerrado a nivel de BD) — se agrupa tal cual está guardado.
CREATE OR REPLACE FUNCTION platform_organizations_by_department()
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('department', department, 'count', cnt) ORDER BY cnt DESC, department),
    '[]'::jsonb
  )
  FROM (
    SELECT
      COALESCE(NULLIF(btrim(p.location->>'department'), ''), 'Sin especificar') AS department,
      COUNT(*)::integer AS cnt
    FROM "organizations" o
    LEFT JOIN "organization_profiles" p ON p.organization_id = o.id
    GROUP BY 1
  ) x;
$$;

REVOKE ALL ON FUNCTION platform_organizations_by_department() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_organizations_by_department() TO adoptafacil_app;

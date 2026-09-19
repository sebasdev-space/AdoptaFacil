-- M13 · indicador de "tasa de crecimiento mensual" (RF28), dashboard de
-- PlatformSuperAdmin. Mismo patrón SECURITY DEFINER de solo lectura ya usado
-- por el resto de `platform_*` en 20260825010000_s8_platform_dashboards — NO
-- agrega tablas, solo cuenta filas ya existentes de `organizations.created_at`.
--
-- Alcance deliberado (RF28 mínimo): compara organizaciones REGISTRADAS en los
-- últimos 30 días contra las registradas en los 30 días anteriores a esos
-- (día 60 a día 30). El % de cambio se deriva en la capa de aplicación
-- (PlatformSuperAdminDashboardService.getSummary(), no aquí) a partir de estos
-- dos conteos ya reales — nunca una fórmula inventada. Otras series
-- (donaciones, adopciones) quedan fuera de este spec: RF28 solo exige el
-- indicador de organizaciones registradas.
CREATE OR REPLACE FUNCTION platform_organizations_growth()
  RETURNS TABLE(
    current_period_count INTEGER,
    previous_period_count INTEGER
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT
    (
      SELECT COUNT(*)::integer
      FROM "organizations"
      WHERE created_at >= now() - interval '30 days'
    ) AS current_period_count,
    (
      SELECT COUNT(*)::integer
      FROM "organizations"
      WHERE created_at >= now() - interval '60 days'
        AND created_at < now() - interval '30 days'
    ) AS previous_period_count;
$$;

REVOKE ALL ON FUNCTION platform_organizations_growth() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_organizations_growth() TO adoptafacil_app;

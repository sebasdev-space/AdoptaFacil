-- F-5 (M15b, RF26): conciliación básica — cruza lo recaudado (donaciones
-- aprobadas) contra lo dispersado (payouts, F-4), por organización y por
-- período calendario (mes, UTC). Reporte de SOLO LECTURA, sin tabla nueva
-- (no persiste nada) — solo una función SECURITY DEFINER que agrega sobre
-- `donations`/`payouts`, ambas ya cubiertas por su propio RLS/no-leak.
--
-- NOTE (mismo patrón que otras migraciones recientes): el diff de Prisma
-- propuso además DROP de ~24 foreign keys añadidas a mano en migraciones
-- anteriores y un ALTER de platform_settings.updated_at sin relación con
-- esta tarea. Ninguno de los dos va aquí: esta migración SOLO agrega la
-- función reconciliation_report.
--
-- `collected` usa breakdown->>'net' (lo que le corresponde a la organización
-- DESPUÉS de comisión), NO amount_charged (lo que se le cobró al donante) —
-- ver la nota de decisión de alcance en `ReconciliationPeriodRow`
-- (packages/contracts/src/payments.ts): comparar el monto bruto cobrado
-- contra lo dispersado marcaría una diferencia permanente en TODA
-- organización (la comisión siempre existe), lo que no sería una anomalía
-- real sino el modelo de negocio esperado.
CREATE OR REPLACE FUNCTION reconciliation_report(
  p_from TIMESTAMP,
  p_to TIMESTAMP,
  p_organization_id UUID DEFAULT NULL
)
  RETURNS TABLE(
    organization_id UUID,
    organization_name TEXT,
    period TEXT,
    collected INTEGER,
    dispersed_paid INTEGER,
    dispersed_scheduled INTEGER,
    dispersed_failed INTEGER
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  WITH collected_cte AS (
    SELECT d.organization_id AS org_id,
           to_char(date_trunc('month', d.created_at), 'YYYY-MM') AS period,
           SUM((d.breakdown->>'net')::int) AS collected
    FROM donations d
    WHERE d.status = 'approved'
      AND d.created_at >= p_from AND d.created_at < p_to
      AND (p_organization_id IS NULL OR d.organization_id = p_organization_id)
    GROUP BY d.organization_id, period
  ),
  dispersed_cte AS (
    SELECT p.organization_id AS org_id,
           to_char(date_trunc('month', p.created_at), 'YYYY-MM') AS period,
           SUM(p.amount) FILTER (WHERE p.status = 'paid') AS dispersed_paid,
           SUM(p.amount) FILTER (WHERE p.status = 'scheduled') AS dispersed_scheduled,
           SUM(p.amount) FILTER (WHERE p.status = 'failed') AS dispersed_failed
    FROM payouts p
    WHERE p.created_at >= p_from AND p.created_at < p_to
      AND (p_organization_id IS NULL OR p.organization_id = p_organization_id)
    GROUP BY p.organization_id, period
  ),
  combined AS (
    SELECT COALESCE(c.org_id, d.org_id) AS org_id,
           COALESCE(c.period, d.period) AS period,
           COALESCE(c.collected, 0)::int AS collected,
           COALESCE(d.dispersed_paid, 0)::int AS dispersed_paid,
           COALESCE(d.dispersed_scheduled, 0)::int AS dispersed_scheduled,
           COALESCE(d.dispersed_failed, 0)::int AS dispersed_failed
    FROM collected_cte c
    FULL OUTER JOIN dispersed_cte d ON c.org_id = d.org_id AND c.period = d.period
  )
  SELECT o.id, o.name, combined.period,
         combined.collected, combined.dispersed_paid, combined.dispersed_scheduled, combined.dispersed_failed
  FROM combined
  JOIN organizations o ON o.id = combined.org_id
  ORDER BY combined.period DESC, o.name ASC;
$$;

REVOKE ALL ON FUNCTION reconciliation_report(TIMESTAMP, TIMESTAMP, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reconciliation_report(TIMESTAMP, TIMESTAMP, UUID) TO adoptafacil_app;

-- F1-01 · "Mis solicitudes" de adopción (Persona) — GET /adoptions/mine.
--
-- RLS aisla `adoption_requests` por ORGANIZACIÓN dueña del animal (tenant_isolation,
-- migración T-028a). Un solicitante (Persona) puede tener solicitudes en MÚLTIPLES
-- organizaciones distintas de la suya (no es miembro de ninguna de ellas) — una
-- consulta normal del rol de app, scoped por tenant, nunca vería más de una a la
-- vez. Se necesita una lectura CROSS-TENANT controlada por IDENTIDAD del
-- solicitante, mismo patrón exacto que `donations_for_donor` (T-050/S1-02): SQL
-- plano, SECURITY DEFINER, sin JOIN — el nombre de la organización se resuelve
-- aparte (batch, anti-N+1) en el service, igual que hace `listMine` de donations.
CREATE OR REPLACE FUNCTION adoption_requests_for_applicant(p_user_id UUID)
  RETURNS SETOF "adoption_requests"
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM "adoption_requests" WHERE "applicant_user_id" = p_user_id ORDER BY "created_at" DESC;
$$;

REVOKE ALL ON FUNCTION adoption_requests_for_applicant(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION adoption_requests_for_applicant(UUID) TO adoptafacil_app;

-- M07 · registrar fallecimiento de un animal apadrinado (hallazgo QA en vivo,
-- `POST /animals/:id/register-death`). No hay tabla nueva ni cambio de esquema:
-- `animals.status` ya es un `String` libre (sin enum de Postgres), así que el
-- nuevo valor 'deceased' no requiere ALTER TABLE alguno.
--
-- `AnimalsService.registerDeath` resuelve, DENTRO de su propio
-- `withOrgContext(organizationId, ...)`, qué apadrinamientos ACTIVOS tiene el
-- animal — una lectura normal con RLS (el apadrinamiento vive en la MISMA org
-- que el animal; no hace falta cruzar tenants para encontrarlos, a diferencia
-- de `create_sponsorship`). Lo que SÍ cruza tenants es notificar al padrino:
-- es una Persona que normalmente no pertenece a esa organización, así que su
-- email vive detrás de la RLS de `users` (T-011 tenant_isolation) y una
-- lectura RLS-scoped a la org del animal nunca lo vería.
--
-- Esta función, acotada a UN animal (no un fan-out cross-org como
-- `sponsorships_due_for_billing()`, T-057), expone SOLO
-- (sponsorship_id, sponsor_user_id, sponsor_email) de sus apadrinamientos
-- ACTIVOS — el mínimo necesario para notificar, mismo patrón de exposición
-- acotada SECURITY DEFINER que el resto de lecturas cross-tenant del proyecto.
CREATE OR REPLACE FUNCTION sponsorship_active_sponsors_for_animal(p_animal_id UUID)
  RETURNS TABLE(
    sponsorship_id UUID,
    sponsor_user_id UUID,
    sponsor_email TEXT
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT s.id, s.sponsor_user_id, u.email
  FROM "sponsorships" s
  JOIN "users" u ON u.id = s.sponsor_user_id
  WHERE s.animal_id = p_animal_id AND s.status = 'active';
$$;

REVOKE ALL ON FUNCTION sponsorship_active_sponsors_for_animal(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sponsorship_active_sponsors_for_animal(UUID) TO adoptafacil_app;

-- S2-03 · M07 sponsorships frontend (RF17): "Mis apadrinamientos" (Persona).
--
-- Gap found while wiring the frontend against the real backend: `GET /sponsorships`
-- is org-scoped (RLS + VIEW_ROLES=Owner/Administrator/ReadOnlyAuditor) — a sponsor
-- (padrino) has neither an org tenant context nor one of those roles, so it can
-- never list their OWN subscriptions. M05 donations solved the identical problem
-- with `donations_for_donor(actor.id)` (cross-tenant, by identity, SECURITY
-- DEFINER); this migration adds the sponsorships equivalent, enriched with the
-- plan/animal/org display names the frontend needs (Person has no other way to
-- resolve them — a sponsor is never a member of the sponsored org, so it cannot
-- read `sponsorship_plans`/`animals` through the normal RLS-protected path).
--
-- Bounded read-only exposure only: no PII beyond what the sponsor is already
-- entitled to see about their OWN sponsorship. `animals`/`sponsorship_plans` stay
-- RLS-protected for every other access path; this function runs as its owner
-- (SECURITY DEFINER) and returns ONLY the columns listed below.
CREATE OR REPLACE FUNCTION sponsorships_for_sponsor(p_user_id UUID)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'organizationId', s.organization_id,
        'planId', s.plan_id,
        'planName', p.name,
        'planAmount', p.amount,
        'planPeriodicity', p.periodicity,
        'animalId', s.animal_id,
        'animalName', a.name,
        'sponsorUserId', s.sponsor_user_id,
        'status', s.status,
        'startedAt', s.started_at,
        'suspendedAt', s.suspended_at,
        'cancelledAt', s.cancelled_at,
        'createdAt', s.created_at
      )
      ORDER BY s.created_at DESC
    ),
    '[]'::jsonb
  )
  FROM "sponsorships" s
  JOIN "sponsorship_plans" p ON p.id = s.plan_id
  JOIN "animals" a ON a.id = s.animal_id
  WHERE s.sponsor_user_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION sponsorships_for_sponsor(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sponsorships_for_sponsor(UUID) TO adoptafacil_app;

-- ============================================================================
-- M07 · Sponsor name snapshot (T-057 prep). Adds `sponsor_name` to
-- "sponsorships", captured ONCE at subscribe time from `users.display_name`
-- (same "snapshot, not live" rationale as `DonationDonor` in donations) — the
-- org's own authenticated view of its received sponsorships had no human name
-- for the padrino before this, only the opaque `sponsor_user_id` (the sponsor
-- is never a member of the beneficiary org, so no live join is possible
-- without a cross-tenant lookup). NULL on sponsorships created before this
-- migration; never fabricated for those rows (frontend falls back to a short
-- id badge, matching the existing `shortId()` convention).
--
-- NOTE: only the sponsorships objects are touched here. Prisma's differ also
-- emitted spurious DROP CONSTRAINT statements for the SQL-declared cross-module
-- FKs (organizations/animals) and an unrelated `platform_settings` column-
-- default tweak — both intentionally omitted, same established convention as
-- the T-056 base migration's own note on this.
-- ============================================================================

-- AlterTable
ALTER TABLE "sponsorships" ADD COLUMN "sponsor_name" TEXT;

-- ============================================================================
-- CREATE OR REPLACE: `create_sponsorship` now also snapshots the sponsor's
-- CURRENT display name into the new column at INSERT time. Signature is
-- UNCHANGED (still `(plan_id, sponsor_user_id)`) — the function already runs
-- SECURITY DEFINER (elevated, bypasses RLS) for the cross-tenant INSERT into
-- "sponsorships" itself, so reading `users.display_name` by id inside the same
-- function adds no new privilege boundary. Everything else is identical to the
-- T-056 version.
-- ============================================================================
CREATE OR REPLACE FUNCTION create_sponsorship(
  p_plan_id UUID,
  p_sponsor_user_id UUID
)
  RETURNS SETOF "sponsorships"
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  s "sponsorships";
  v_org UUID;
  v_animal UUID;
  v_active BOOLEAN;
  v_sponsor_name TEXT;
BEGIN
  SELECT organization_id, animal_id, is_active INTO v_org, v_animal, v_active
    FROM "sponsorship_plans" WHERE id = p_plan_id;
  IF NOT FOUND OR NOT v_active THEN
    RETURN; -- unknown or archived plan ⇒ no-op (app throws 404)
  END IF;

  SELECT display_name INTO v_sponsor_name FROM "users" WHERE id = p_sponsor_user_id;

  INSERT INTO "sponsorships" (
    "id", "organization_id", "plan_id", "animal_id", "sponsor_user_id", "sponsor_name",
    "status", "started_at", "created_at", "updated_at"
  ) VALUES (
    gen_random_uuid(), v_org, p_plan_id, v_animal, p_sponsor_user_id, v_sponsor_name,
    'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
  RETURNING * INTO s;

  INSERT INTO "sponsorship_status_history" (
    "id", "organization_id", "sponsorship_id", "from_status", "to_status", "actor_user_id", "created_at"
  ) VALUES (
    gen_random_uuid(), v_org, s.id, NULL, 'active', p_sponsor_user_id, CURRENT_TIMESTAMP
  );

  RETURN NEXT s;
END;
$$;

REVOKE ALL ON FUNCTION create_sponsorship(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_sponsorship(UUID, UUID) TO adoptafacil_app;

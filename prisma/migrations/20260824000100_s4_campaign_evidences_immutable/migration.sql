-- ============================================================================
-- CAMPAIGN EVIDENCES → APPEND-ONLY IMMUTABLE (M06, RF16, S-4). T-054 originally
-- shipped this table as soft-mutable (UPDATE granted, `deleted_at` soft-delete)
-- with a working edit/delete UI. S-4 makes the accountability spirit explicit
-- and non-negotiable: a donor must trust that a PUBLISHED evidence never
-- changes after they looked at it — same as every other audit-grade table in
-- this codebase (formalization_transitions, dian_verification_attempts,
-- legal_representatives). No correction/replacement flow is invented here —
-- TODO(client) if the client ever asks to invalidate/replace a published
-- evidence. The app's own PATCH/DELETE endpoints and their frontend
-- edit/delete UI were removed in this same change (they would otherwise be
-- permanently-broken dead code once the DB rejects the operations below).
-- ============================================================================

-- `updated_at`/`deleted_at` no longer have any purpose on a pure insert-only
-- table (same shape as formalization_transitions/dian_verification_attempts —
-- neither has these columns either).
ALTER TABLE "campaign_evidences" DROP COLUMN "updated_at";
ALTER TABLE "campaign_evidences" DROP COLUMN "deleted_at";

-- Least privilege: the app role may only READ + INSERT. T-054 granted UPDATE
-- for the (now-removed) edit/soft-delete flow; DELETE/TRUNCATE were already
-- revoked from day one.
REVOKE UPDATE ON "campaign_evidences" FROM adoptafacil_app;

-- DB-enforced immutability for EVERY role (incl. superuser, normal path): no
-- UPDATE, DELETE or TRUNCATE is ever permitted once a row exists. Row/
-- statement triggers fire for every caller, so a privileged role cannot
-- alter/remove a published evidence through the normal SQL path either.
CREATE OR REPLACE FUNCTION campaign_evidences_reject_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'campaign_evidences is append-only: % is not permitted (RF16, S-4)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER campaign_evidences_no_update
  BEFORE UPDATE ON "campaign_evidences"
  FOR EACH ROW EXECUTE FUNCTION campaign_evidences_reject_mutation();

CREATE TRIGGER campaign_evidences_no_delete
  BEFORE DELETE ON "campaign_evidences"
  FOR EACH ROW EXECUTE FUNCTION campaign_evidences_reject_mutation();

CREATE TRIGGER campaign_evidences_no_truncate
  BEFORE TRUNCATE ON "campaign_evidences"
  FOR EACH STATEMENT EXECUTE FUNCTION campaign_evidences_reject_mutation();

-- Re-declare the public accountability report function (T-054): `deleted_at`
-- no longer exists, so every evidence of a non-cancelled campaign is public
-- (there is no soft-delete state left to filter out).
CREATE OR REPLACE FUNCTION public_campaign_accountability(p_campaign_id UUID)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'campaign', jsonb_build_object(
      'id', c.id,
      'organizationId', c.organization_id,
      'organizationName', o.name,
      'title', c.title,
      'description', c.description,
      'category', c.category,
      'goalAmount', c.goal_amount,
      'raisedAmount', c.raised_amount,
      'deadline', c.deadline,
      'status', c.status,
      'createdAt', c.created_at
    ),
    'evidences', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', e.id,
            'type', e.type,
            'concept', e.concept,
            'amount', e.amount,
            'spentAt', e.spent_at,
            'storageRef', e.storage_ref,
            'order', e.order
          )
          ORDER BY e.order ASC, e.created_at ASC
        )
        FROM campaign_evidences e
        WHERE e.campaign_id = c.id
      ),
      '[]'::jsonb
    )
  )
  FROM campaigns c
  JOIN organizations o ON o.id = c.organization_id
  WHERE c.id = p_campaign_id AND c.status IN ('active', 'closed');
$$;

REVOKE ALL ON FUNCTION public_campaign_accountability(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_campaign_accountability(UUID) TO adoptafacil_app;

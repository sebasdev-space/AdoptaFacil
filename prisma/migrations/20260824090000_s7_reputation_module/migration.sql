-- M12 · reputación: calificación, reseñas, verificaciones, indicadores
-- públicos (RF23, Ola 3 adelantada, S-7). Arquitectura preparada para
-- moderación: la organización reseñada NUNCA modera sus propias reseñas —
-- solo PlatformAdmin/PlatformSuperAdmin, mismo criterio que S-3 (duplicidad)
-- y la cola de documentos (S1-05/S2-06).

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "moderated_by_user_id" UUID,
    "moderated_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reviews_organization_id_idx" ON "reviews"("organization_id");

-- One active review per (organization, author) — FOREVER, not just "while
-- pending". There is no edit/replace flow (TODO(client) if the business wants
-- one), so a second attempt by the same author on the same organization is
-- always rejected, regardless of the first review's status.
CREATE UNIQUE INDEX "reviews_organization_id_author_user_id_key" ON "reviews"("organization_id", "author_user_id");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_user_id_fkey"
  FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_moderated_by_user_id_fkey"
  FOREIGN KEY ("moderated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Defense-in-depth: rating is 1-5 (also validated in create_review() below,
-- for a friendlier error message than a bare constraint violation).
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

-- RLS (RF23, S-7)
ALTER TABLE "reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reviews" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "reviews"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- Locked down like campaign_evidences/volunteer_certificates: the app role
-- never gets UPDATE. Every mutation (creation, moderation decision, hide)
-- happens exclusively through the SECURITY DEFINER functions below, which run
-- as their owner and are the only path that can touch this table beyond a
-- plain SELECT/INSERT.
GRANT SELECT, INSERT ON "reviews" TO adoptafacil_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "reviews" FROM adoptafacil_app;

-- Content is immutable after submission: rating/comment/organization_id/
-- author_user_id/is_anonymous/created_at never change, even for a superuser
-- or a bug inside a DEFINER function below — only status + moderation
-- columns may ever move, and only through reviews_validate_transition().
CREATE OR REPLACE FUNCTION reviews_reject_content_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.rating IS DISTINCT FROM OLD.rating
     OR NEW.comment IS DISTINCT FROM OLD.comment
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.author_user_id IS DISTINCT FROM OLD.author_user_id
     OR NEW.is_anonymous IS DISTINCT FROM OLD.is_anonymous
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION
      'reviews: content is immutable after submission (RF23)'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Controlled status transition: pending -> approved|rejected, approved ->
-- hidden. Any other change (including rejected -> approved, hidden ->
-- anything, approved -> rejected) is rejected. A same-value update is a no-op
-- and always allowed (e.g. touching an unrelated column would require one,
-- though none exists today).
CREATE OR REPLACE FUNCTION reviews_validate_transition() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF NOT (
    (OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected')) OR
    (OLD.status = 'approved' AND NEW.status = 'hidden')
  ) THEN
    RAISE EXCEPTION
      'reviews: invalid status transition % -> % (RF23)', OLD.status, NEW.status
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION reviews_reject_removal() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'reviews keeps the full review trail: % is not permitted (RF23)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER reviews_no_content_mutation
  BEFORE UPDATE ON "reviews"
  FOR EACH ROW EXECUTE FUNCTION reviews_reject_content_mutation();

CREATE TRIGGER reviews_validate_status_transition
  BEFORE UPDATE ON "reviews"
  FOR EACH ROW EXECUTE FUNCTION reviews_validate_transition();

CREATE TRIGGER reviews_no_delete
  BEFORE DELETE ON "reviews"
  FOR EACH ROW EXECUTE FUNCTION reviews_reject_removal();

CREATE TRIGGER reviews_no_truncate
  BEFORE TRUNCATE ON "reviews"
  FOR EACH STATEMENT EXECUTE FUNCTION reviews_reject_removal();

-- ============================================================================
-- Cross-tenant creation: ANY authenticated Person may review ANY organization
-- (the author is never necessarily a member of that org) — same technique as
-- create_sponsorship/create_volunteer_enrollment. Unknown org ⇒ no rows (app
-- throws 404); a second review by the same author on the same org raises a
-- unique_violation, caught by the service and mapped to 400.
-- ============================================================================
CREATE OR REPLACE FUNCTION create_review(
  p_organization_id UUID,
  p_author_user_id UUID,
  p_rating INTEGER,
  p_comment TEXT,
  p_is_anonymous BOOLEAN
)
  RETURNS SETOF "reviews"
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  r "reviews";
BEGIN
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'create_review: rating must be between 1 and 5';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = p_organization_id) THEN
    RETURN; -- unknown org ⇒ no-op (app throws 404)
  END IF;

  INSERT INTO "reviews" (
    "id", "organization_id", "author_user_id", "rating", "comment",
    "is_anonymous", "status", "created_at"
  ) VALUES (
    gen_random_uuid(), p_organization_id, p_author_user_id, p_rating,
    NULLIF(btrim(COALESCE(p_comment, '')), ''), COALESCE(p_is_anonymous, false),
    'pending', CURRENT_TIMESTAMP
  )
  RETURNING * INTO r;

  RETURN NEXT r;
END;
$$;

REVOKE ALL ON FUNCTION create_review(UUID, UUID, INTEGER, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_review(UUID, UUID, INTEGER, TEXT, BOOLEAN) TO adoptafacil_app;

-- The caller's own reviews across ALL organizations ("Mis reseñas") — JSONB,
-- already camelCase, same technique as volunteer_enrollments_for_user.
CREATE OR REPLACE FUNCTION reviews_for_author(p_author_user_id UUID)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'organizationId', r.organization_id,
        'organizationName', o.name,
        'authorUserId', r.author_user_id,
        'rating', r.rating,
        'comment', r.comment,
        'isAnonymous', r.is_anonymous,
        'status', r.status,
        'moderatedByUserId', r.moderated_by_user_id,
        'moderatedAt', r.moderated_at,
        'rejectionReason', r.rejection_reason,
        'createdAt', r.created_at
      )
      ORDER BY r.created_at DESC
    ),
    '[]'::jsonb
  )
  FROM "reviews" r
  JOIN organizations o ON o.id = r.organization_id
  WHERE r.author_user_id = p_author_user_id;
$$;

REVOKE ALL ON FUNCTION reviews_for_author(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reviews_for_author(UUID) TO adoptafacil_app;

-- PlatformAdmin moderation queue: actionable reviews across ALL organizations
-- — pending (needs approve/reject) and approved (may later need to be hidden
-- on a report). Rejected/hidden reviews are terminal and already in the audit
-- trail, so they are intentionally excluded from this actionable queue.
-- Includes the real author identity — INTERNAL visibility only, never public,
-- regardless of is_anonymous (same criterion as RF13/M05 anonymous donations:
-- anonymity is public-facing only).
CREATE OR REPLACE FUNCTION platform_review_queue()
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'organizationId', r.organization_id,
        'organizationName', o.name,
        'authorUserId', r.author_user_id,
        'authorName', u.display_name,
        'rating', r.rating,
        'comment', r.comment,
        'isAnonymous', r.is_anonymous,
        'status', r.status,
        'moderatedByUserId', r.moderated_by_user_id,
        'moderatedAt', r.moderated_at,
        'rejectionReason', r.rejection_reason,
        'createdAt', r.created_at
      )
      ORDER BY r.created_at
    ),
    '[]'::jsonb
  )
  FROM "reviews" r
  JOIN organizations o ON o.id = r.organization_id
  JOIN users u ON u.id = r.author_user_id
  WHERE r.status IN ('pending', 'approved');
$$;

REVOKE ALL ON FUNCTION platform_review_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_review_queue() TO adoptafacil_app;

-- Apply approve/reject to a PENDING review and record the audit event
-- atomically, under the REVIEWED organization (cross-tenant). A reason is
-- mandatory to reject. The transition trigger above is the hard backstop
-- against a bug here ever skipping a state.
CREATE OR REPLACE FUNCTION platform_review_decide(
  p_review_id UUID,
  p_status TEXT,
  p_reviewer_id UUID,
  p_reason TEXT
)
  RETURNS JSONB
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_row "reviews"%ROWTYPE;
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'platform_review_decide: invalid decision "%"', p_status;
  END IF;
  IF p_status = 'rejected' AND v_reason IS NULL THEN
    RAISE EXCEPTION 'a reason is required to reject a review';
  END IF;

  SELECT * INTO v_row FROM "reviews" WHERE id = p_review_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review not found';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'review already decided (status=%)', v_row.status;
  END IF;

  UPDATE "reviews"
     SET status = p_status,
         rejection_reason = v_reason,
         moderated_by_user_id = p_reviewer_id,
         moderated_at = CURRENT_TIMESTAMP
   WHERE id = p_review_id
   RETURNING * INTO v_row;

  INSERT INTO audit_logs (
    id, organization_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
  ) VALUES (
    gen_random_uuid(),
    v_row.organization_id,
    p_reviewer_id,
    'reputation.review_' || p_status,
    'review',
    v_row.id::text,
    jsonb_build_object('decision', p_status),
    CURRENT_TIMESTAMP
  );

  RETURN jsonb_build_object(
    'id', v_row.id,
    'organizationId', v_row.organization_id,
    'authorUserId', v_row.author_user_id,
    'rating', v_row.rating,
    'comment', v_row.comment,
    'isAnonymous', v_row.is_anonymous,
    'status', v_row.status,
    'moderatedByUserId', v_row.moderated_by_user_id,
    'moderatedAt', v_row.moderated_at,
    'rejectionReason', v_row.rejection_reason,
    'createdAt', v_row.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION platform_review_decide(UUID, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_review_decide(UUID, TEXT, UUID, TEXT) TO adoptafacil_app;

-- Hide an already-APPROVED review after a later report (objective #3). Reason
-- is mandatory. There is no public "report a review" intake in this spec
-- (TODO(client) if one is required) — a PlatformAdmin invokes this directly
-- once made aware of a problem review by any external means.
CREATE OR REPLACE FUNCTION platform_review_hide(
  p_review_id UUID,
  p_reviewer_id UUID,
  p_reason TEXT
)
  RETURNS JSONB
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_row "reviews"%ROWTYPE;
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'a reason is required to hide a review';
  END IF;

  SELECT * INTO v_row FROM "reviews" WHERE id = p_review_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review not found';
  END IF;
  IF v_row.status <> 'approved' THEN
    RAISE EXCEPTION 'only an approved review can be hidden (status=%)', v_row.status;
  END IF;

  UPDATE "reviews"
     SET status = 'hidden',
         rejection_reason = v_reason,
         moderated_by_user_id = p_reviewer_id,
         moderated_at = CURRENT_TIMESTAMP
   WHERE id = p_review_id
   RETURNING * INTO v_row;

  INSERT INTO audit_logs (
    id, organization_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
  ) VALUES (
    gen_random_uuid(),
    v_row.organization_id,
    p_reviewer_id,
    'reputation.review_hidden',
    'review',
    v_row.id::text,
    jsonb_build_object('reason', v_reason),
    CURRENT_TIMESTAMP
  );

  RETURN jsonb_build_object(
    'id', v_row.id,
    'organizationId', v_row.organization_id,
    'authorUserId', v_row.author_user_id,
    'rating', v_row.rating,
    'comment', v_row.comment,
    'isAnonymous', v_row.is_anonymous,
    'status', v_row.status,
    'moderatedByUserId', v_row.moderated_by_user_id,
    'moderatedAt', v_row.moderated_at,
    'rejectionReason', v_row.rejection_reason,
    'createdAt', v_row.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION platform_review_hide(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_review_hide(UUID, UUID, TEXT) TO adoptafacil_app;

-- ============================================================================
-- PUBLIC INDICATORS (no session) — read-only aggregate, mirrors
-- legal_representative_summary() (S-1): plain SQL, STABLE, SECURITY DEFINER,
-- NEVER touches Organization/org.ts (M01's contract stays untouched, contracts
-- aditivos). AVG() over zero approved reviews is NULL — the service defaults
-- it to 0.
-- ============================================================================
CREATE OR REPLACE FUNCTION organization_reputation_summary(p_organization_id UUID)
  RETURNS TABLE(
    average_rating NUMERIC,
    approved_review_count INTEGER
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT
    ROUND(AVG(rating)::numeric, 2) AS average_rating,
    COUNT(*)::integer AS approved_review_count
  FROM "reviews"
  WHERE organization_id = p_organization_id AND status = 'approved';
$$;

REVOKE ALL ON FUNCTION organization_reputation_summary(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION organization_reputation_summary(UUID) TO adoptafacil_app;

-- Public approved reviews for ONE organization, respecting the anonymity flag
-- chosen at submission time — authorName is NULL when is_anonymous is true.
CREATE OR REPLACE FUNCTION public_approved_reviews(
  p_organization_id UUID,
  p_limit INTEGER,
  p_offset INTEGER
)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'items', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', x.id,
            'rating', x.rating,
            'comment', x.comment,
            'authorName', CASE WHEN x.is_anonymous THEN NULL ELSE x.display_name END,
            'createdAt', x.created_at
          )
          ORDER BY x.created_at DESC
        )
        FROM (
          SELECT r.id, r.rating, r.comment, r.is_anonymous, r.created_at, u.display_name
          FROM "reviews" r
          JOIN users u ON u.id = r.author_user_id
          WHERE r.organization_id = p_organization_id AND r.status = 'approved'
          ORDER BY r.created_at DESC
          LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
          OFFSET GREATEST(COALESCE(p_offset, 0), 0)
        ) x
      ),
      '[]'::jsonb
    ),
    'total', (
      SELECT COUNT(*) FROM "reviews"
      WHERE organization_id = p_organization_id AND status = 'approved'
    )
  );
$$;

REVOKE ALL ON FUNCTION public_approved_reviews(UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_approved_reviews(UUID, INTEGER, INTEGER) TO adoptafacil_app;

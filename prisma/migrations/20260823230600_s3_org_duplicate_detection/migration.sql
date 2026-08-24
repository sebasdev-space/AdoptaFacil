-- CreateTable
CREATE TABLE "organization_duplicate_flags" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "matched_organization_id" UUID NOT NULL,
    "match_type" TEXT NOT NULL,
    "similarity_score" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decided_by_user_id" UUID,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_duplicate_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_duplicate_flags_organization_id_idx" ON "organization_duplicate_flags"("organization_id");

-- CreateIndex
CREATE INDEX "organization_duplicate_flags_matched_organization_id_idx" ON "organization_duplicate_flags"("matched_organization_id");

-- CreateIndex
CREATE INDEX "organization_duplicate_flags_status_idx" ON "organization_duplicate_flags"("status");

-- AddForeignKey
ALTER TABLE "organization_duplicate_flags" ADD CONSTRAINT "organization_duplicate_flags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_duplicate_flags" ADD CONSTRAINT "organization_duplicate_flags_matched_organization_id_fkey" FOREIGN KEY ("matched_organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ORGANIZATION DUPLICATE DETECTION (M01, S-3) — risk-table §16 "Captación
-- ilegal / LA-FT" mitigation; no explicit RF in the base document. Only
-- `similar_name` matches ever land a row here — an exact NIT match is a hard
-- block at write time (application layer, 409), never persisted for review.
-- ============================================================================

-- `pg_trgm` powers the fuzzy name-similarity check (similarity()) used by the
-- application layer against `organizations.name` — that table is NOT under
-- RLS (see its own comment: it is the platform-level tenant catalog), so this
-- query runs as a plain SELECT, no SECURITY DEFINER needed for it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS organizations_name_trgm_idx
  ON "organizations" USING GIN ("name" gin_trgm_ops);

-- 1. Tenant RLS (same canonical policy as every other business table),
--    scoped to the FLAGGED organization. An org only ever sees its own flags
--    through the normal tenant path (which no UI surfaces today — only the
--    platform review endpoints below read this table); a query with no
--    tenant context yields zero rows.
ALTER TABLE "organization_duplicate_flags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_duplicate_flags" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "organization_duplicate_flags"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- 2. Least privilege: the app role may only READ + INSERT (a flag is created
--    as a side effect of a profile save). It CANNOT update or delete — the
--    single pending→dismissed/confirmed decision happens only through
--    platform_duplicate_flag_decide() below (SECURITY DEFINER).
GRANT SELECT, INSERT ON "organization_duplicate_flags" TO adoptafacil_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "organization_duplicate_flags" FROM adoptafacil_app;

-- 3. DB-enforced immutability for EVERY role (incl. superuser, normal path):
--    - UPDATE is rejected once the flag has been decided (status past
--      pending): the decision is frozen forever, same convention as
--      organization_documents (RNF05).
--    - DELETE/TRUNCATE are always rejected: the review trail is kept forever.
CREATE OR REPLACE FUNCTION organization_duplicate_flags_freeze_decision() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION
      'organization_duplicate_flags: a decided flag is immutable (status=%) (S-3)',
      OLD.status
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION organization_duplicate_flags_reject_removal() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'organization_duplicate_flags keeps the full review trail: % is not permitted (S-3)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER organization_duplicate_flags_freeze_after_decision
  BEFORE UPDATE ON "organization_duplicate_flags"
  FOR EACH ROW EXECUTE FUNCTION organization_duplicate_flags_freeze_decision();

CREATE TRIGGER organization_duplicate_flags_no_delete
  BEFORE DELETE ON "organization_duplicate_flags"
  FOR EACH ROW EXECUTE FUNCTION organization_duplicate_flags_reject_removal();

CREATE TRIGGER organization_duplicate_flags_no_truncate
  BEFORE TRUNCATE ON "organization_duplicate_flags"
  FOR EACH STATEMENT EXECUTE FUNCTION organization_duplicate_flags_reject_removal();

-- ============================================================================
-- CROSS-TENANT ACCESSORS — controlled exceptions to RLS (like
-- organization_public in T-101 / platform_document_queue in T-103). Each one
-- exposes ONLY the bounded shape a caller needs; EXECUTE is granted solely to
-- the app role.
-- ============================================================================

-- Exact-NIT lookup: `organization_profiles.nit` is RLS-scoped, so a plain
-- SELECT from another org's tenant context returns nothing. Used to enforce
-- the hard NIT-uniqueness rule BEFORE a profile write — returns at most one
-- OTHER organization (excluding the caller's own) currently holding this NIT.
-- Exposes only organization_id + name, never other profile columns.
CREATE OR REPLACE FUNCTION find_organization_by_nit(p_nit TEXT, p_exclude_org_id UUID)
  RETURNS TABLE(
    organization_id UUID,
    organization_name TEXT
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT p.organization_id, o.name
  FROM organization_profiles p
  JOIN organizations o ON o.id = p.organization_id
  WHERE p.nit = p_nit
    AND p.organization_id <> p_exclude_org_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION find_organization_by_nit(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_organization_by_nit(TEXT, UUID) TO adoptafacil_app;

-- Review queue: pending duplicate flags across all organizations, oldest
-- first. Emits only the columns a reviewer needs (never phone/legal_name or
-- other private org data).
CREATE OR REPLACE FUNCTION platform_duplicate_flag_queue()
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', f.id,
        'organizationId', f.organization_id,
        'organizationName', o1.name,
        'matchedOrganizationId', f.matched_organization_id,
        'matchedOrganizationName', o2.name,
        'matchType', f.match_type,
        'similarityScore', f.similarity_score,
        'status', f.status,
        'decidedByUserId', f.decided_by_user_id,
        'decidedAt', f.decided_at,
        'createdAt', f.created_at
      )
      ORDER BY f.created_at
    ),
    '[]'::jsonb
  )
  FROM organization_duplicate_flags f
  JOIN organizations o1 ON o1.id = f.organization_id
  JOIN organizations o2 ON o2.id = f.matched_organization_id
  WHERE f.status = 'pending';
$$;

REVOKE ALL ON FUNCTION platform_duplicate_flag_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_duplicate_flag_queue() TO adoptafacil_app;

-- Apply a review decision (dismiss/confirm) to one flag and record the audit
-- event atomically, under the FLAGGED organization (cross-tenant). Enforces:
-- valid target status; the flag exists; it has not already been decided. The
-- freeze trigger then locks the row. This spec only RECORDS the decision — it
-- never takes any automatic action on either organization (TODO(client): the
-- base document does not define what happens operationally after a confirmed
-- duplicate — suspend the newer org? contact both? — that is a business
-- decision, not something to invent here).
CREATE OR REPLACE FUNCTION platform_duplicate_flag_decide(
  p_flag_id UUID,
  p_status TEXT,
  p_reviewer_id UUID
)
  RETURNS JSONB
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_row organization_duplicate_flags%ROWTYPE;
BEGIN
  IF p_status NOT IN ('dismissed', 'confirmed') THEN
    RAISE EXCEPTION 'platform_duplicate_flag_decide: invalid decision "%"', p_status;
  END IF;

  SELECT * INTO v_row FROM organization_duplicate_flags WHERE id = p_flag_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'duplicate flag not found';
  END IF;

  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'duplicate flag already decided (status=%)', v_row.status;
  END IF;

  UPDATE organization_duplicate_flags
     SET status = p_status,
         decided_by_user_id = p_reviewer_id,
         decided_at = CURRENT_TIMESTAMP
   WHERE id = p_flag_id
   RETURNING * INTO v_row;

  -- Append-only audit, tenant = the FLAGGED org (never the reviewer's).
  INSERT INTO audit_logs (
    id, organization_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
  ) VALUES (
    gen_random_uuid(),
    v_row.organization_id,
    p_reviewer_id,
    'organization.duplicate_flag_' || p_status,
    'organization_duplicate_flag',
    v_row.id::text,
    jsonb_build_object(
      'decision', p_status,
      'matchType', v_row.match_type,
      'matchedOrganizationId', v_row.matched_organization_id
    ),
    CURRENT_TIMESTAMP
  );

  RETURN jsonb_build_object(
    'id', v_row.id,
    'organizationId', v_row.organization_id,
    'matchedOrganizationId', v_row.matched_organization_id,
    'matchType', v_row.match_type,
    'similarityScore', v_row.similarity_score,
    'status', v_row.status,
    'decidedByUserId', v_row.decided_by_user_id,
    'decidedAt', v_row.decided_at,
    'createdAt', v_row.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION platform_duplicate_flag_decide(UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_duplicate_flag_decide(UUID, TEXT, UUID) TO adoptafacil_app;

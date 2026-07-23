-- CreateTable
CREATE TABLE "organization_documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "storage_ref" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "issued_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "review_note" TEXT,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_documents_organization_id_idx" ON "organization_documents"("organization_id");

-- CreateIndex
CREATE INDEX "organization_documents_status_idx" ON "organization_documents"("status");

-- CreateIndex
CREATE UNIQUE INDEX "organization_documents_organization_id_type_version_key" ON "organization_documents"("organization_id", "type", "version");

-- AddForeignKey
ALTER TABLE "organization_documents" ADD CONSTRAINT "organization_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ORGANIZATION DOCUMENTS (M01, RF03, RNF05) — tenant-isolated (RNF03), versioned
-- and immutable-after-decision. Prisma does not model RLS/triggers/functions, so
-- this SQL is maintained by hand (mirrors organization_profiles + the append-only
-- audit/formalization pattern).
-- ============================================================================

-- 1. Tenant RLS (same canonical policy as every other business table). An org
--    only ever sees/inserts its own documents; a query with no tenant context
--    yields zero rows.
ALTER TABLE "organization_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_documents" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "organization_documents"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- 2. Least privilege: the app role may only READ + INSERT (upload = new version).
--    It CANNOT update or delete — the single review-decision update happens only
--    through platform_document_decide() below (SECURITY DEFINER), and the version
--    history is never mutated/removed by the app role.
GRANT SELECT, INSERT ON "organization_documents" TO adoptafacil_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "organization_documents" FROM adoptafacil_app;

-- 3. DB-enforced immutability for EVERY role (incl. superuser, normal path):
--    - UPDATE is rejected once the row has been DECIDED (status past
--      pending/under_review): review metadata is frozen after a decision (RNF05).
--    - DELETE/TRUNCATE are always rejected: the version history is kept forever.
--    Row/statement triggers fire for every caller, so a privileged role cannot
--    alter/remove a decided document through the normal SQL path either.
CREATE OR REPLACE FUNCTION organization_documents_freeze_decision() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status NOT IN ('pending', 'under_review') THEN
    RAISE EXCEPTION
      'organization_documents: review metadata is immutable once decided (status=%) (RNF05)',
      OLD.status
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION organization_documents_reject_removal() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'organization_documents keeps the full version history: % is not permitted (RNF05)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER organization_documents_freeze_after_decision
  BEFORE UPDATE ON "organization_documents"
  FOR EACH ROW EXECUTE FUNCTION organization_documents_freeze_decision();

CREATE TRIGGER organization_documents_no_delete
  BEFORE DELETE ON "organization_documents"
  FOR EACH ROW EXECUTE FUNCTION organization_documents_reject_removal();

CREATE TRIGGER organization_documents_no_truncate
  BEFORE TRUNCATE ON "organization_documents"
  FOR EACH STATEMENT EXECUTE FUNCTION organization_documents_reject_removal();

-- ============================================================================
-- CROSS-TENANT PLATFORM REVIEW — controlled exception to RLS (like
-- organization_public in T-101). A PlatformAdmin/PlatformSuperAdmin reviews
-- documents ACROSS organizations, but the reviewer's request runs in their OWN
-- tenant context, so a normal app-role read/update of another org's row returns
-- zero rows / is blocked by RLS. Instead of evading RLS with a privileged
-- SELECT */UPDATE, these SECURITY DEFINER functions run as their owner (the
-- migration superuser) and expose ONLY the bounded shape below. They are the
-- ONLY path across tenants; EXECUTE is granted solely to the app role, and the
-- endpoints that call them are gated by RBAC to platform roles — so no org role
-- can reach cross-tenant data laterally.
-- ============================================================================

-- Review queue: Pending/UnderReview documents across all organizations, ordered
-- oldest-first. Emits only the columns a reviewer needs (never phone/legal_name
-- or other private org data).
CREATE OR REPLACE FUNCTION platform_document_queue()
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', d.id,
        'organizationId', d.organization_id,
        'organizationName', o.name,
        'type', d.type,
        'version', d.version,
        'status', d.status,
        'storageRef', d.storage_ref,
        'issuedAt', d.issued_at,
        'expiresAt', d.expires_at,
        'createdAt', d.created_at
      )
      ORDER BY d.created_at
    ),
    '[]'::jsonb
  )
  FROM organization_documents d
  JOIN organizations o ON o.id = d.organization_id
  WHERE d.status IN ('pending', 'under_review');
$$;

REVOKE ALL ON FUNCTION platform_document_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_document_queue() TO adoptafacil_app;

-- Apply a review decision to one document and record the audit event atomically,
-- under the DOCUMENT's organization (cross-tenant). Enforces: valid target
-- status; a mandatory reason (motivo) for observed/rejected; the document exists;
-- and it has not already been decided. The freeze trigger then locks the row.
-- Returns the updated document in the OrganizationDocument shape (camelCase).
CREATE OR REPLACE FUNCTION platform_document_decide(
  p_document_id UUID,
  p_status TEXT,
  p_reviewer_id UUID,
  p_note TEXT
)
  RETURNS JSONB
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_row organization_documents%ROWTYPE;
  v_note TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
  IF p_status NOT IN ('observed', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'platform_document_decide: invalid decision "%"', p_status;
  END IF;

  IF p_status IN ('observed', 'rejected') AND v_note IS NULL THEN
    RAISE EXCEPTION 'a reason is required to observe or reject a document';
  END IF;

  SELECT * INTO v_row FROM organization_documents WHERE id = p_document_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'document not found';
  END IF;

  IF v_row.status NOT IN ('pending', 'under_review') THEN
    RAISE EXCEPTION 'document already decided (status=%)', v_row.status;
  END IF;

  UPDATE organization_documents
     SET status = p_status,
         review_note = v_note,
         reviewed_by_user_id = p_reviewer_id,
         reviewed_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
   WHERE id = p_document_id
   RETURNING * INTO v_row;

  -- Append-only audit, tenant = the DOCUMENT's org (never the reviewer's). Only
  -- non-sensitive metadata (decision/type/version) — never document content.
  INSERT INTO audit_logs (
    id, organization_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
  ) VALUES (
    gen_random_uuid(),
    v_row.organization_id,
    p_reviewer_id,
    'organization.document_' || p_status,
    'organization_document',
    v_row.id::text,
    jsonb_build_object('decision', p_status, 'type', v_row.type, 'version', v_row.version),
    CURRENT_TIMESTAMP
  );

  RETURN jsonb_build_object(
    'id', v_row.id,
    'organizationId', v_row.organization_id,
    'type', v_row.type,
    'storageRef', v_row.storage_ref,
    'version', v_row.version,
    'issuedAt', v_row.issued_at,
    'expiresAt', v_row.expires_at,
    'status', v_row.status,
    'reviewNote', v_row.review_note,
    'reviewedByUserId', v_row.reviewed_by_user_id,
    'reviewedAt', v_row.reviewed_at,
    'createdAt', v_row.created_at,
    'updatedAt', v_row.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION platform_document_decide(UUID, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_document_decide(UUID, TEXT, UUID, TEXT) TO adoptafacil_app;

-- ============================================================================
-- M06 · Campaign spending evidences (accountability, RF16 · T-054).
-- Tenant-scoped business table: an org uploads invoices/receipts/proofs/photos
-- showing how a campaign's money was used. Money in INTEGER COP (nullable — a
-- photo may carry none). Files live in StoragePort as PUBLIC objects; only the
-- storage ref + metadata are stored here. Soft-managed via deleted_at (no
-- physical DELETE by the app role). Public exposure goes through a bounded
-- SECURITY DEFINER function (public columns only).
--
-- NOTE: only the campaign_evidences objects are declared here. The spurious
-- DROP CONSTRAINT / ALTER statements Prisma's differ emits for the SQL-declared
-- organization FKs (and platform_settings) are intentionally omitted — those FKs
-- are managed in raw SQL on purpose, same convention as T-053/T-104.
-- ============================================================================

-- CreateTable
CREATE TABLE "campaign_evidences" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "amount" INTEGER,
    "spent_at" TIMESTAMP(3) NOT NULL,
    "storage_ref" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaign_evidences_organization_id_idx" ON "campaign_evidences"("organization_id");

-- CreateIndex
CREATE INDEX "campaign_evidences_campaign_id_idx" ON "campaign_evidences"("campaign_id");

-- AddForeignKey (intra-module, matches the Prisma @relation on CampaignEvidence).
ALTER TABLE "campaign_evidences" ADD CONSTRAINT "campaign_evidences_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey to organizations (declared in SQL, NOT as a Prisma @relation, to
-- avoid editing the Organization model in org.prisma — another owner's file).
ALTER TABLE "campaign_evidences" ADD CONSTRAINT "campaign_evidences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ROW-LEVEL SECURITY (RNF03). Tenant-scoped: an org only ever reads/edits its
-- OWN evidences on the authenticated path. Mirrors the campaigns policy (T-053).
-- ============================================================================
ALTER TABLE "campaign_evidences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campaign_evidences" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "campaign_evidences"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- Least privilege: read + insert + update (edit / soft-delete via deleted_at).
-- Never DELETE — evidences are removed logically, not physically, by the app role.
GRANT SELECT, INSERT, UPDATE ON "campaign_evidences" TO adoptafacil_app;
REVOKE DELETE, TRUNCATE ON "campaign_evidences" FROM adoptafacil_app;

-- ============================================================================
-- PUBLIC ACCOUNTABILITY REPORT (RF16) — controlled exception to RLS. A public
-- visitor has NO tenant context, so a normal app-role read returns zero rows.
-- This SECURITY DEFINER function runs as its owner and returns ONLY the public
-- campaign columns + the public evidence columns (concept, amount, date, public
-- file ref, order) for NON-cancelled campaigns. Cancelled campaigns and
-- soft-deleted evidences are never surfaced. EXECUTE is granted solely to the
-- app role (never PUBLIC). No "executed %" is computed here (raised = T-055).
-- ============================================================================
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
        WHERE e.campaign_id = c.id AND e.deleted_at IS NULL
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

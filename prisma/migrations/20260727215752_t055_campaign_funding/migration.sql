-- ============================================================================
-- M06 · Real campaign funding (RF15 progress · T-055). An APPROVED donation
-- attributed to a campaign (concept_kind='campaign') adds its NET to that
-- campaign's raised_amount EXACTLY ONCE. The idempotency ledger
-- `campaign_funding_applications` (unique on collection_id) is the persistent
-- "already counted" marker. The bounded SECURITY DEFINER functions let the
-- gateway webhook (no tenant context) apply funding without evading RLS — the
-- same technique as the T-106 worker.
--
-- NOTE: only the campaign_funding_applications objects are declared here. The
-- spurious DROP CONSTRAINT / ALTER statements Prisma's differ emits for the
-- SQL-declared organization FKs (and platform_settings) are intentionally
-- omitted — those FKs are managed in raw SQL on purpose (T-053/T-054 convention).
-- ============================================================================

-- CreateTable
CREATE TABLE "campaign_funding_applications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "collection_id" TEXT NOT NULL,
    "net" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_funding_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (UNIQUE collection_id = the idempotency marker)
CREATE UNIQUE INDEX "campaign_funding_applications_collection_id_key" ON "campaign_funding_applications"("collection_id");
CREATE INDEX "campaign_funding_applications_organization_id_idx" ON "campaign_funding_applications"("organization_id");
CREATE INDEX "campaign_funding_applications_campaign_id_idx" ON "campaign_funding_applications"("campaign_id");

-- AddForeignKey (intra-module, matches the Prisma @relation on CampaignFundingApplication).
ALTER TABLE "campaign_funding_applications" ADD CONSTRAINT "campaign_funding_applications_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey to organizations (SQL, not a Prisma @relation — org.prisma is another owner's file).
ALTER TABLE "campaign_funding_applications" ADD CONSTRAINT "campaign_funding_applications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ROW-LEVEL SECURITY (RNF03). Tenant-scoped: an org only reads its OWN funding
-- ledger on the authenticated path. Inserts happen through the SECURITY DEFINER
-- functions below (owner bypasses RLS), so the app role gets SELECT only. The
-- ledger is append-only (no update/delete): a correction is never a silent edit.
-- ============================================================================
ALTER TABLE "campaign_funding_applications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campaign_funding_applications" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "campaign_funding_applications"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT ON "campaign_funding_applications" TO adoptafacil_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "campaign_funding_applications" FROM adoptafacil_app;

-- ============================================================================
-- APPLY ONE approved campaign collection (webhook path — no tenant context).
-- Counts the donation's NET toward its campaign's raised_amount EXACTLY ONCE:
--   - the donation must exist, be concept_kind='campaign' and status='approved';
--   - the target campaign must be ACTIVE (policy: solo si la campaña está activa —
--     donations to closed/cancelled campaigns are NOT counted; refunds are out of
--     scope, section 24 paused);
--   - the ledger insert (ON CONFLICT collection_id DO NOTHING) is the idempotency
--     gate — a repeated webhook adds nothing.
-- Returns the applied (organization_id, campaign_id, net) ONLY when newly counted,
-- so the caller can audit it; a no-op returns 0 rows.
-- ============================================================================
CREATE OR REPLACE FUNCTION apply_campaign_funding(p_collection_id TEXT)
  RETURNS TABLE (organization_id UUID, campaign_id UUID, net INTEGER)
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  d_org UUID;
  d_campaign UUID;
  d_status TEXT;
  d_net INTEGER;
BEGIN
  SELECT dn.organization_id, dn.concept_id, dn.status, (dn.breakdown->>'net')::int
    INTO d_org, d_campaign, d_status, d_net
    FROM donations dn
    WHERE dn.collection_id = p_collection_id AND dn.concept_kind = 'campaign';
  IF NOT FOUND OR d_status <> 'approved' THEN
    RETURN; -- unknown / not a campaign donation / not approved ⇒ no-op
  END IF;

  PERFORM 1 FROM campaigns c WHERE c.id = d_campaign AND c.status = 'active';
  IF NOT FOUND THEN
    RETURN; -- target campaign not active ⇒ not counted (documented policy)
  END IF;

  INSERT INTO campaign_funding_applications ("id", "organization_id", "campaign_id", "collection_id", "net", "created_at")
    VALUES (gen_random_uuid(), d_org, d_campaign, p_collection_id, d_net, CURRENT_TIMESTAMP)
    ON CONFLICT ("collection_id") DO NOTHING;
  IF NOT FOUND THEN
    RETURN; -- already counted (idempotent) ⇒ no-op
  END IF;

  UPDATE campaigns SET raised_amount = raised_amount + d_net, updated_at = CURRENT_TIMESTAMP
    WHERE id = d_campaign;

  RETURN QUERY SELECT d_org, d_campaign, d_net;
END;
$$;

REVOKE ALL ON FUNCTION apply_campaign_funding(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_campaign_funding(TEXT) TO adoptafacil_app;

-- ============================================================================
-- RECONCILE all of an org's approved campaign donations not yet counted (the
-- authenticated self-service / catch-up path). Applies each via the same ledger
-- gate and returns the newly-applied rows so the caller can audit them. Bounded
-- to one org; idempotent (re-running counts nothing new).
-- ============================================================================
CREATE OR REPLACE FUNCTION reconcile_org_campaign_funding(p_org_id UUID)
  RETURNS TABLE (organization_id UUID, campaign_id UUID, collection_id TEXT, net INTEGER)
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  r RECORD;
  applied RECORD;
BEGIN
  FOR r IN
    SELECT dn.collection_id
    FROM donations dn
    JOIN campaigns c ON c.id = dn.concept_id
    WHERE dn.organization_id = p_org_id
      AND dn.concept_kind = 'campaign'
      AND dn.status = 'approved'
      AND c.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM campaign_funding_applications a WHERE a.collection_id = dn.collection_id
      )
  LOOP
    SELECT * INTO applied FROM apply_campaign_funding(r.collection_id);
    IF applied.campaign_id IS NOT NULL THEN
      organization_id := applied.organization_id;
      campaign_id := applied.campaign_id;
      collection_id := r.collection_id;
      net := applied.net;
      RETURN NEXT;
    END IF;
  END LOOP;
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION reconcile_org_campaign_funding(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reconcile_org_campaign_funding(UUID) TO adoptafacil_app;

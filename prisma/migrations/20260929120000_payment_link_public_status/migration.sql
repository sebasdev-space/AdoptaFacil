-- Wires the REAL MercadoPago checkout redirect end-to-end (donations +
-- sponsorships, Fabián's domain). MercadoPago's Checkout Pro sends the payer
-- BACK to our own `back_urls` after paying, carrying `external_reference` —
-- which IS our own `collectionId` (donations: `af-<idempotencyKey>`;
-- sponsorships: the attempt's own `collectionId`). Resolving that reference
-- into a "gracias" screen needs a cross-tenant, PUBLIC-safe read (no session,
-- no tenant context) — same bounded SECURITY DEFINER technique already used
-- by `donation_by_id`/`donation_certificate_by_donation` et al. (T-050) and
-- `sponsorship_billing_recovery_context` et al. (S-5-REDISEÑO). No table/
-- column changes here — `sponsorship_payment_attempts.payment_link_url`
-- already exists (S-5-REDISEÑO migration); it was simply never WRITTEN by
-- the app code until this task, which is a TypeScript-only fix, not a schema
-- one. Each function exposes ONLY the columns a "gracias" page needs
-- (status/amount/org name) — never the payer's/sponsor's identity.

CREATE OR REPLACE FUNCTION donation_by_collection_id(p_collection_id TEXT)
  RETURNS SETOF "donations"
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM "donations" WHERE "collection_id" = p_collection_id;
$$;

REVOKE ALL ON FUNCTION donation_by_collection_id(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION donation_by_collection_id(TEXT) TO adoptafacil_app;

CREATE OR REPLACE FUNCTION sponsorship_payment_attempt_by_collection_id(p_collection_id TEXT)
  RETURNS TABLE(
    payment_status TEXT,
    organization_name TEXT,
    plan_amount INTEGER
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT sp.status, o.name, pl.amount
  FROM "sponsorship_payment_attempts" spa
  JOIN "sponsorship_payments" sp ON sp.id = spa.sponsorship_payment_id
  JOIN "sponsorships" s ON s.id = sp.sponsorship_id
  JOIN "sponsorship_plans" pl ON pl.id = s.plan_id
  JOIN "organizations" o ON o.id = spa.organization_id
  WHERE spa.collection_id = p_collection_id
  ORDER BY spa.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION sponsorship_payment_attempt_by_collection_id(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sponsorship_payment_attempt_by_collection_id(TEXT) TO adoptafacil_app;

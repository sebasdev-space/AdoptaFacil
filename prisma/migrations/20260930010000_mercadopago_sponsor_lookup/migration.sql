-- Split de Pagos 1:1 (T-OrdersAPI) — cross-tenant DISCOVERY of a beneficiary
-- organization's own connected MercadoPago account, so `donations.service.ts`
-- (and the sponsorship payment services) can route a charge to it via
-- `integration_data.sponsor.id` WITHOUT ever reading the access/refresh
-- tokens. Same posture/shape as `mercadopago_accounts_due_for_refresh`
-- (20260930000000_mercadopago_connect): SECURITY DEFINER, STABLE, narrow
-- column list, revoked from PUBLIC, granted only to the app role. No table
-- change in this migration — only this one read-only function.

CREATE OR REPLACE FUNCTION mercadopago_account_mp_user_id(p_organization_id UUID)
  RETURNS TABLE(
    mp_user_id TEXT
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT a.mp_user_id
  FROM "organization_mercadopago_accounts" a
  WHERE a.organization_id = p_organization_id;
$$;

REVOKE ALL ON FUNCTION mercadopago_account_mp_user_id(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mercadopago_account_mp_user_id(UUID) TO adoptafacil_app;

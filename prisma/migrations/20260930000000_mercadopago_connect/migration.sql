-- Split de Pagos 1:1 (T-OAuth-Connect) — "conectar tu cuenta de Mercado Pago"
-- infra ONLY: OAuth connect/disconnect + credential storage per organization.
-- Wiring `mp_user_id` into an actual split payment at checkout is a SEPARATE
-- follow-up (out of scope here, see payments.prisma model doc comment).

-- CreateTable
CREATE TABLE "organization_mercadopago_accounts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "mp_user_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_mercadopago_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_mercadopago_accounts_organization_id_key" ON "organization_mercadopago_accounts"("organization_id");
CREATE INDEX "organization_mercadopago_accounts_organization_id_idx" ON "organization_mercadopago_accounts"("organization_id");
CREATE INDEX "organization_mercadopago_accounts_expires_at_idx" ON "organization_mercadopago_accounts"("expires_at");

-- AddForeignKey (frontera M15→M01): FK a organizations a mano (org.prisma es
-- de @sebastian; la relación no vive en el modelo Prisma, igual que las demás
-- tablas de este archivo — organization_bank_accounts/payouts).
ALTER TABLE "organization_mercadopago_accounts"
  ADD CONSTRAINT "organization_mercadopago_accounts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ROW-LEVEL SECURITY (RNF03) — una organización solo ve/gestiona SU PROPIA
-- cuenta de Mercado Pago conectada. Patrón canónico _rls_probe, igual que
-- organization_bank_accounts (misma tabla "un renglón por org, con delete
-- permitido para desconectar" — a diferencia de sponsorship_payments, que es
-- un ledger append-only, esta tabla SÍ permite UPDATE/DELETE porque
-- desconectar/reconectar es una operación normal, no una mutación a ocultar).
-- ============================================================================
ALTER TABLE "organization_mercadopago_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_mercadopago_accounts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "organization_mercadopago_accounts"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "organization_mercadopago_accounts" TO adoptafacil_app;

-- ============================================================================
-- CROSS-TENANT DISCOVERY (SECURITY DEFINER, read-only) — the daily token-
-- refresh job runs with NO tenant context (background worker, same shape as
-- `sponsorships_due_for_billing()`). Every WRITE that follows a discovery read
-- happens under `withOrgContext(organizationId, ...)` for that specific row's
-- own org — a normal RLS-scoped Prisma UPDATE, no privilege escalation beyond
-- the read itself. Never returns the tokens in cleartext to anything but the
-- app role's own trusted process — this function is NOT exposed publicly.
-- ============================================================================
CREATE OR REPLACE FUNCTION mercadopago_accounts_due_for_refresh(p_window_days INTEGER)
  RETURNS TABLE(
    id UUID,
    organization_id UUID,
    refresh_token TEXT,
    expires_at TIMESTAMP(3)
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT a.id, a.organization_id, a.refresh_token, a.expires_at
  FROM "organization_mercadopago_accounts" a
  WHERE a.expires_at <= (CURRENT_TIMESTAMP + make_interval(days => p_window_days));
$$;

REVOKE ALL ON FUNCTION mercadopago_accounts_due_for_refresh(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mercadopago_accounts_due_for_refresh(INTEGER) TO adoptafacil_app;

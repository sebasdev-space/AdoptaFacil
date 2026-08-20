-- F-4 (M15b, RF26): dispersión T+1 vía Wompi Payouts.
--
-- NOTE (mismo patrón que otras migraciones recientes): el diff de Prisma
-- propuso además DROP de ~24 foreign keys añadidas a mano en migraciones
-- anteriores (org.prisma/animals.prisma/etc. no modelan esas relaciones) y un
-- ALTER de platform_settings.updated_at sin relación con esta tarea. Ninguno
-- de los dos va aquí: esta migración solo agrega organization_bank_accounts
-- y payouts.

-- CreateTable
CREATE TABLE "organization_bank_accounts" (
    "organization_id" UUID NOT NULL,
    "bank_code" TEXT NOT NULL,
    "account_type" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "account_holder_name" TEXT NOT NULL,
    "account_holder_document" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_bank_accounts_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "idempotency_key" TEXT NOT NULL,
    "wompi_payout_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payouts_organization_id_idx" ON "payouts"("organization_id");
CREATE INDEX "payouts_status_idx" ON "payouts"("status");
CREATE UNIQUE INDEX "payouts_organization_id_idempotency_key_key" ON "payouts"("organization_id", "idempotency_key");
CREATE UNIQUE INDEX "payouts_wompi_payout_id_key" ON "payouts"("wompi_payout_id");

-- AddForeignKey (frontera M15→M01): FK a organizations a mano (org.prisma es
-- de @sebastian; la relación no vive en el modelo Prisma, igual que la RLS).
ALTER TABLE "organization_bank_accounts"
  ADD CONSTRAINT "organization_bank_accounts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payouts"
  ADD CONSTRAINT "payouts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ROW-LEVEL SECURITY (RNF03) — una organización solo ve/gestiona SU cuenta
-- bancaria y SUS payouts. Patrón canónico _rls_probe.
-- ============================================================================
ALTER TABLE "organization_bank_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_bank_accounts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "organization_bank_accounts"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "payouts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payouts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payouts"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "organization_bank_accounts" TO adoptafacil_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "payouts" TO adoptafacil_app;

-- ============================================================================
-- Confirmación del payout vía webhook de Wompi (sin contexto de tenant, igual
-- que `apply_donation_webhook`): transiciona 'scheduled' → 'paid' | 'failed'
-- SOLO desde 'scheduled' — un reintento del webhook (misma entrega repetida)
-- ya no encuentra la fila en ese estado y es un no-op idempotente.
-- ============================================================================
CREATE OR REPLACE FUNCTION apply_payout_webhook(
  p_wompi_payout_id TEXT,
  p_status TEXT
)
  RETURNS SETOF "payouts"
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE p "payouts";
BEGIN
  IF p_status NOT IN ('paid', 'failed') THEN
    RETURN; -- estado transitorio (p.ej. IN_PROGRESS) — nada que asentar todavía
  END IF;

  UPDATE "payouts"
    SET "status" = p_status, "updated_at" = CURRENT_TIMESTAMP
    WHERE "wompi_payout_id" = p_wompi_payout_id AND "status" = 'scheduled'
    RETURNING * INTO p;
  IF NOT FOUND THEN
    RETURN; -- payout desconocido o ya asentado ⇒ no-op idempotente
  END IF;
  RETURN NEXT p;
END;
$$;

REVOKE ALL ON FUNCTION apply_payout_webhook(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_payout_webhook(TEXT, TEXT) TO adoptafacil_app;

-- ============================================================================
-- Disparo de payout por un PlatformAdmin (M15/RF26) — su contexto de tenant es
-- SU PROPIA organización de plataforma, no la beneficiaria; un INSERT normal
-- violaría WITH CHECK. Misma técnica que `create_donation`: SECURITY DEFINER,
-- idempotente por (organization_id, idempotency_key) — ON CONFLICT DO NOTHING
-- gana la carrera y un reintento con la misma clave devuelve la MISMA fila
-- (nunca dispersa dos veces). La autorización (solo PlatformAdmin/
-- PlatformSuperAdmin) ya se validó en el controller vía RolesGuard antes de
-- llegar aquí — esta función no evade RBAC, solo el aislamiento de tenant
-- para esta escritura acotada.
-- ============================================================================
CREATE OR REPLACE FUNCTION create_payout(
  p_organization_id UUID,
  p_amount INTEGER,
  p_idempotency_key TEXT
)
  RETURNS SETOF "payouts"
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE p "payouts";
BEGIN
  INSERT INTO "payouts" (
    "id", "organization_id", "amount", "currency", "idempotency_key", "status", "updated_at"
  ) VALUES (
    gen_random_uuid(), p_organization_id, p_amount, 'COP', p_idempotency_key, 'scheduled', CURRENT_TIMESTAMP
  )
  ON CONFLICT ("organization_id", "idempotency_key") DO NOTHING;

  SELECT * INTO p FROM "payouts"
    WHERE "organization_id" = p_organization_id AND "idempotency_key" = p_idempotency_key;
  RETURN NEXT p;
END;
$$;

-- Lectura acotada por organización (M15b) — la MISMA función que @sebastian
-- consumirá desde el dashboard financiero (M13/RF28): superficie mínima
-- (una sola org por llamada, nunca un dump sin filtro), igual espíritu que
-- las demás lecturas cross-tenant de este archivo.
CREATE OR REPLACE FUNCTION payouts_for_organization(p_organization_id UUID)
  RETURNS SETOF "payouts"
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM "payouts" WHERE "organization_id" = p_organization_id ORDER BY "created_at" DESC;
$$;

REVOKE ALL ON FUNCTION create_payout(UUID, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION payouts_for_organization(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_payout(UUID, INTEGER, TEXT) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION payouts_for_organization(UUID) TO adoptafacil_app;

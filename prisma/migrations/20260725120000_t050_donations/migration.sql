-- T-050 · M05 donations (P1): donación + recibo automático.
--
-- NOTE: como en T-028a/b/c, el diff de Prisma propone además DROP de FKs añadidas a
-- mano sobre tablas de otros módulos (M03/M04) y un ALTER de `platform_settings`
-- (tabla de @sebastian). Esos NO van aquí: esta migración SOLO crea los objetos
-- propios de M05 y no toca esquemas ajenos.

-- CreateTable: donations
CREATE TABLE "donations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "donor_user_id" UUID NOT NULL,
    "concept_kind" TEXT NOT NULL,
    "concept_id" UUID NOT NULL,
    "commission_payer" TEXT NOT NULL,
    "intended_amount" INTEGER NOT NULL,
    "amount_charged" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "breakdown" JSONB NOT NULL,
    "collection_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payer" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "donations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: donation_receipts
CREATE TABLE "donation_receipts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "donation_id" UUID NOT NULL,
    "dedup_key" TEXT NOT NULL,
    "donor" JSONB NOT NULL,
    "intended_amount" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donation_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "donations_organization_id_idx" ON "donations"("organization_id");
CREATE INDEX "donations_donor_user_id_idx" ON "donations"("donor_user_id");
CREATE INDEX "donations_status_idx" ON "donations"("status");
CREATE UNIQUE INDEX "donations_organization_id_idempotency_key_key" ON "donations"("organization_id", "idempotency_key");
CREATE UNIQUE INDEX "donations_collection_id_key" ON "donations"("collection_id");
CREATE INDEX "donation_receipts_organization_id_idx" ON "donation_receipts"("organization_id");
CREATE UNIQUE INDEX "donation_receipts_dedup_key_key" ON "donation_receipts"("dedup_key");
CREATE UNIQUE INDEX "donation_receipts_donation_id_key" ON "donation_receipts"("donation_id");

-- AddForeignKey (donation↔receipt, ambas M05 — modelada en Prisma).
ALTER TABLE "donation_receipts"
  ADD CONSTRAINT "donation_receipts_donation_id_fkey"
  FOREIGN KEY ("donation_id") REFERENCES "donations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (frontera M05→M01): FK a organizations a mano (org.prisma es de
-- @sebastian; la relación no vive en el modelo Prisma, igual que la RLS).
ALTER TABLE "donations"
  ADD CONSTRAINT "donations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "donation_receipts"
  ADD CONSTRAINT "donation_receipts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ROW-LEVEL SECURITY (RNF03) — una organización solo ve SUS donaciones/recibos.
-- Patrón canónico _rls_probe; el runtime conecta como el rol NO-superusuario
-- `adoptafacil_app`, que no puede saltarse la RLS.
-- ============================================================================
ALTER TABLE "donations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "donations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "donations"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "donation_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "donation_receipts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "donation_receipts"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "donations" TO adoptafacil_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "donation_receipts" TO adoptafacil_app;

-- ============================================================================
-- CREACIÓN CROSS-TENANT CONTROLADA (M05) — una Persona dona a OTRA organización;
-- su contexto de tenant es el suyo, así que un INSERT normal violaría WITH CHECK.
-- En vez de evadir la RLS con un rol privilegiado, estas funciones SECURITY DEFINER
-- (misma técnica que `create_adoption_request`) escriben/leen SOLO lo acotado.
-- Todas devuelven SETOF (no composite): 0 filas ⇒ "no encontrado", sin fila NULL.
-- ============================================================================

-- Alta idempotente por (organization_id, idempotency_key): un reintento devuelve la
-- misma donación sin duplicar la fila (ON CONFLICT DO NOTHING gana la carrera).
CREATE OR REPLACE FUNCTION create_donation(
  p_organization_id UUID,
  p_donor_user_id UUID,
  p_concept_kind TEXT,
  p_concept_id UUID,
  p_commission_payer TEXT,
  p_intended_amount INTEGER,
  p_amount_charged INTEGER,
  p_breakdown JSONB,
  p_collection_id TEXT,
  p_idempotency_key TEXT,
  p_payer JSONB
)
  RETURNS SETOF "donations"
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE d "donations";
BEGIN
  INSERT INTO "donations" (
    "id", "organization_id", "donor_user_id", "concept_kind", "concept_id",
    "commission_payer", "intended_amount", "amount_charged", "currency",
    "breakdown", "collection_id", "idempotency_key", "status", "payer", "updated_at"
  ) VALUES (
    gen_random_uuid(), p_organization_id, p_donor_user_id, p_concept_kind, p_concept_id,
    p_commission_payer, p_intended_amount, p_amount_charged, 'COP',
    p_breakdown, p_collection_id, p_idempotency_key, 'pending', p_payer, CURRENT_TIMESTAMP
  )
  ON CONFLICT ("organization_id", "idempotency_key") DO NOTHING;

  SELECT * INTO d FROM "donations"
    WHERE "organization_id" = p_organization_id AND "idempotency_key" = p_idempotency_key;
  RETURN NEXT d;
END;
$$;

-- Lectura de idempotencia: la donación por (org, key), o 0 filas.
CREATE OR REPLACE FUNCTION donation_by_idempotency(p_organization_id UUID, p_idempotency_key TEXT)
  RETURNS SETOF "donations"
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM "donations"
  WHERE "organization_id" = p_organization_id AND "idempotency_key" = p_idempotency_key;
$$;

-- Aplica el webhook (verificado por el PaymentPort): liquida la donación y, al
-- aprobar, emite el recibo. Idempotente: la transición solo ocurre desde 'pending'
-- (un webhook repetido no la re-liquida ⇒ 0 filas ⇒ no-op) y el recibo es único por
-- dedup_key. Devuelve la donación SOLO cuando transiciona de verdad.
CREATE OR REPLACE FUNCTION apply_donation_webhook(
  p_collection_id TEXT,
  p_status TEXT,
  p_dedup_key TEXT
)
  RETURNS SETOF "donations"
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE d "donations";
BEGIN
  IF p_status = 'approved' THEN
    UPDATE "donations"
      SET "status" = 'approved', "updated_at" = CURRENT_TIMESTAMP
      WHERE "collection_id" = p_collection_id AND "status" = 'pending'
      RETURNING * INTO d;
    IF NOT FOUND THEN
      RETURN; -- recaudo desconocido o ya liquidado ⇒ no-op idempotente
    END IF;
    INSERT INTO "donation_receipts" (
      "id", "organization_id", "donation_id", "dedup_key",
      "donor", "intended_amount", "breakdown", "issued_at"
    ) VALUES (
      gen_random_uuid(), d."organization_id", d."id", p_dedup_key,
      COALESCE(d."payer", '{}'::jsonb), d."intended_amount", d."breakdown", CURRENT_TIMESTAMP
    )
    ON CONFLICT ("dedup_key") DO NOTHING;
    RETURN NEXT d;
  ELSIF p_status = 'declined' THEN
    UPDATE "donations"
      SET "status" = 'declined', "updated_at" = CURRENT_TIMESTAMP
      WHERE "collection_id" = p_collection_id AND "status" = 'pending'
      RETURNING * INTO d;
    IF NOT FOUND THEN
      RETURN;
    END IF;
    RETURN NEXT d;
  END IF;
  RETURN;
END;
$$;

-- Las donaciones del DONANTE (para su bandeja "mis donaciones"), cross-tenant.
CREATE OR REPLACE FUNCTION donations_for_donor(p_user_id UUID)
  RETURNS SETOF "donations"
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM "donations" WHERE "donor_user_id" = p_user_id ORDER BY "created_at" DESC;
$$;

-- El recibo de UNA donación del donante (guard de identidad: solo si es suya).
CREATE OR REPLACE FUNCTION donation_receipt_for_donor(p_donation_id UUID, p_user_id UUID)
  RETURNS SETOF "donation_receipts"
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.* FROM "donation_receipts" r
  JOIN "donations" d ON d."id" = r."donation_id"
  WHERE r."donation_id" = p_donation_id AND d."donor_user_id" = p_user_id;
$$;

REVOKE ALL ON FUNCTION create_donation(UUID, UUID, TEXT, UUID, TEXT, INTEGER, INTEGER, JSONB, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION donation_by_idempotency(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION apply_donation_webhook(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION donations_for_donor(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION donation_receipt_for_donor(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_donation(UUID, UUID, TEXT, UUID, TEXT, INTEGER, INTEGER, JSONB, TEXT, TEXT, JSONB) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION donation_by_idempotency(UUID, TEXT) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION apply_donation_webhook(TEXT, TEXT, TEXT) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION donations_for_donor(UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION donation_receipt_for_donor(UUID, UUID) TO adoptafacil_app;

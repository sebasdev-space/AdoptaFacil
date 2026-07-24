-- T-028b · M04 adoption CONTRACT + electronic signature (RF11, RNF05, RNF10).
--
-- NOTE: as in T-028a, Prisma's diff may propose dropping hand-added FKs on other
-- modules' tables (they are declared in raw SQL, not modeled in Prisma). Those are
-- intentionally NOT in this migration: it ONLY adds M04's own `adoption_contracts`
-- objects.

-- CreateTable
CREATE TABLE "adoption_contracts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "signers" JSONB NOT NULL,
    "payload" JSONB NOT NULL,
    "content_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "signed_at" TIMESTAMP(3),

    CONSTRAINT "adoption_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "adoption_contracts_organization_id_idx" ON "adoption_contracts"("organization_id");
CREATE INDEX "adoption_contracts_status_idx" ON "adoption_contracts"("status");

-- RNF05 · versionamiento documental: una fila por (solicitud, versión). En este
-- corte la versión es 1; re-emitir generaría una versión nueva sin sobrescribir.
CREATE UNIQUE INDEX "adoption_contracts_request_id_version_key"
  ON "adoption_contracts"("request_id", "version");

-- AddForeignKey (fronteras M04→M01 y M04→M04): las relaciones no se modelan en
-- Prisma; las FK + cascade se añaden a mano (igual que la RLS).
ALTER TABLE "adoption_contracts"
  ADD CONSTRAINT "adoption_contracts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "adoption_contracts"
  ADD CONSTRAINT "adoption_contracts_request_id_fkey"
  FOREIGN KEY ("request_id") REFERENCES "adoption_requests"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ROW-LEVEL SECURITY (RNF03) — una organización solo ve/gestiona SUS contratos.
-- ============================================================================
ALTER TABLE "adoption_contracts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "adoption_contracts" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "adoption_contracts"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "adoption_contracts" TO adoptafacil_app;

-- ============================================================================
-- INMUTABILIDAD (RNF05) — un contrato `signed` queda sellado por hash: cualquier
-- intento de EDITAR (UPDATE) una fila ya firmada se aborta para CUALQUIER rol
-- (incluido superusuario). La transición HACIA `signed` sí se permite (OLD.status
-- != signed). NO se bloquea el DELETE: el borrado por cascada al eliminar la
-- organización (FK ON DELETE CASCADE) es una operación de ciclo de vida distinta
-- de la edición de contenido; la inmutabilidad protege el CONTENIDO firmado.
-- ============================================================================
CREATE OR REPLACE FUNCTION adoption_contract_freeze()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'signed' THEN
    RAISE EXCEPTION 'adoption contract %/% is sealed (signed) and immutable', OLD.id, OLD.version;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER adoption_contract_freeze_tr
  BEFORE UPDATE ON "adoption_contracts"
  FOR EACH ROW EXECUTE FUNCTION adoption_contract_freeze();

-- ============================================================================
-- FIRMA CROSS-TENANT CONTROLADA (M04) — el ADOPTANTE (Persona) firma su parte de
-- un contrato que vive en el tenant de OTRA organización; su contexto de tenant es
-- el suyo, así que un SELECT/UPDATE normal del rol de app no vería la fila. En vez
-- de evadir la RLS con un rol privilegiado, estas funciones SECURITY DEFINER (misma
-- técnica que `create_adoption_request`) exponen SOLO la fila cuyo array `signers`
-- contiene al usuario, y SOLO mientras el contrato está `pending_signatures`. La
-- autorización fina (que el usuario ES ese firmante) la reafirma la API antes de
-- llamarlas; el representante de la org también las usa (un único camino de firma).
-- ============================================================================

-- Leer un contrato para un firmante legítimo (org rep o adoptante), sin importar
-- el tenant. Devuelve la fila solo si `p_user_id` está en `signers`.
CREATE OR REPLACE FUNCTION adoption_contract_for_signer(p_contract_id UUID, p_user_id UUID)
  RETURNS SETOF "adoption_contracts"
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT *
  FROM "adoption_contracts"
  WHERE "id" = p_contract_id
    AND "signers" @> jsonb_build_array(jsonb_build_object('userId', p_user_id::text));
$$;

-- Aplicar firmas / sellar. Solo actúa si `p_user_id` es firmante y el contrato está
-- `pending_signatures`. Si `p_seal` es true, pasa a `signed`, fija el hash y el
-- `signed_at` (UTC). Idempotente respecto al estado (WHERE status = pending).
CREATE OR REPLACE FUNCTION adoption_contract_apply_signatures(
  p_contract_id UUID,
  p_user_id UUID,
  p_signers JSONB,
  p_seal BOOLEAN,
  p_content_hash TEXT
)
  RETURNS SETOF "adoption_contracts"
  LANGUAGE sql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $$
  UPDATE "adoption_contracts"
  SET "signers" = p_signers,
      "status" = CASE WHEN p_seal THEN 'signed' ELSE "status" END,
      "content_hash" = CASE WHEN p_seal THEN p_content_hash ELSE "content_hash" END,
      "signed_at" = CASE WHEN p_seal THEN CURRENT_TIMESTAMP ELSE "signed_at" END,
      "updated_at" = CURRENT_TIMESTAMP
  WHERE "id" = p_contract_id
    AND "status" = 'pending_signatures'
    AND "signers" @> jsonb_build_array(jsonb_build_object('userId', p_user_id::text))
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION adoption_contract_for_signer(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION adoption_contract_apply_signatures(UUID, UUID, JSONB, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION adoption_contract_for_signer(UUID, UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION adoption_contract_apply_signatures(UUID, UUID, JSONB, BOOLEAN, TEXT) TO adoptafacil_app;

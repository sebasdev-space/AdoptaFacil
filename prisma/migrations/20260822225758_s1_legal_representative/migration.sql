-- NOTE (mismo patrón que otras migraciones recientes, ver t_portal_subdomain_
-- resolution / t_reconciliation_report): el diff de Prisma propuso además DROP
-- de ~24 foreign keys añadidas a mano en migraciones anteriores (org.prisma/
-- animals.prisma/etc. no modelan esas relaciones) y un ALTER de
-- platform_settings.updated_at sin relación con esta tarea. Ninguno de los dos
-- va aquí: esta migración SOLO crea legal_representatives + su RLS/inmutabilidad
-- + la función de lectura acotada que M05 (Fabián) va a consumir.

-- CreateTable
CREATE TABLE "legal_representatives" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "document_number" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "signature_file_ref" TEXT NOT NULL,
    "signature_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "signed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_representatives_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "legal_representatives_organization_id_idx" ON "legal_representatives"("organization_id");

-- CreateIndex
CREATE INDEX "legal_representatives_organization_id_signed_at_idx" ON "legal_representatives"("organization_id", "signed_at");

-- AddForeignKey
ALTER TABLE "legal_representatives" ADD CONSTRAINT "legal_representatives_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_representatives" ADD CONSTRAINT "legal_representatives_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- LEGAL REPRESENTATIVES (M01, S-1, RF14 relacionado / RNF10) — tenant-isolated
-- (RNF03) AND append-only, exactly like formalization_transitions. Each row is
-- the immutable record of one registration/re-signing, kept forever; "vigente"
-- is computed at read time (MAX(signed_at) per organization_id), never a stored
-- flag flipped on the old row.
-- ============================================================================

-- 1. Tenant RLS (same canonical policy as every other business table).
ALTER TABLE "legal_representatives" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "legal_representatives" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "legal_representatives"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- 2. Append-only: the app role may only read + insert.
GRANT SELECT, INSERT ON "legal_representatives" TO adoptafacil_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "legal_representatives" FROM adoptafacil_app;

-- 3. Immutability for EVERY role (incl. superuser, normal path): reject any
--    UPDATE/DELETE/TRUNCATE. Reuses the same rejection style as
--    formalization_transitions / audit_logs.
CREATE OR REPLACE FUNCTION legal_representatives_reject_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'legal_representatives is append-only: % is not permitted (RNF10)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER legal_representatives_no_update
  BEFORE UPDATE ON "legal_representatives"
  FOR EACH ROW EXECUTE FUNCTION legal_representatives_reject_mutation();

CREATE TRIGGER legal_representatives_no_delete
  BEFORE DELETE ON "legal_representatives"
  FOR EACH ROW EXECUTE FUNCTION legal_representatives_reject_mutation();

CREATE TRIGGER legal_representatives_no_truncate
  BEFORE TRUNCATE ON "legal_representatives"
  FOR EACH STATEMENT EXECUTE FUNCTION legal_representatives_reject_mutation();

-- ============================================================================
-- CROSS-MODULE NARROW READ for M05 (Fabián) — same pattern as
-- organization_public / organization_slug_by_subdomain / reconciliation_report:
-- a SECURITY DEFINER function is the ONLY path across the module boundary,
-- returning ONLY the columns the donation-certificate template needs (never the
-- document type/number, never a raw signature byte). Fabián's certificate flow
-- already runs inside the RECEIVING organization's own context (it is issuing
-- THAT org's certificate), so this does not need a user JWT — it is meant to be
-- called directly by his backend code, not exposed as a public HTTP route.
-- ============================================================================
CREATE OR REPLACE FUNCTION legal_representative_summary(p_organization_id UUID)
  RETURNS TABLE(
    full_name TEXT,
    "position" TEXT,
    signature_file_ref TEXT,
    signature_hash TEXT
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT full_name, "position", signature_file_ref, signature_hash
  FROM legal_representatives
  WHERE organization_id = p_organization_id
  ORDER BY signed_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION legal_representative_summary(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION legal_representative_summary(UUID) TO adoptafacil_app;

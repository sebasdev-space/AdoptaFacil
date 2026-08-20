-- F-3 (M05, RF14): certificado de donación real.
--
-- NOTE (mismo patrón que otras migraciones recientes): el diff de Prisma
-- propuso además DROP de ~24 foreign keys añadidas a mano en migraciones
-- anteriores (org.prisma/animals.prisma/etc. no modelan esas relaciones) y un
-- ALTER de platform_settings.updated_at sin relación con esta tarea. Ninguno
-- de los dos va aquí: esta migración solo agrega donation_certificates.

-- CreateTable
CREATE TABLE "donation_certificates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "donation_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "content_hash" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donation_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "donation_certificates_donation_id_key" ON "donation_certificates"("donation_id");

-- CreateIndex
CREATE UNIQUE INDEX "donation_certificates_code_key" ON "donation_certificates"("code");

-- CreateIndex
CREATE INDEX "donation_certificates_organization_id_idx" ON "donation_certificates"("organization_id");

-- AddForeignKey
ALTER TABLE "donation_certificates" ADD CONSTRAINT "donation_certificates_donation_id_fkey" FOREIGN KEY ("donation_id") REFERENCES "donations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- RLS (RNF03): mismo patrón que donations/donation_receipts.
-- ============================================================================
ALTER TABLE "donation_certificates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "donation_certificates" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "donation_certificates"
  USING (organization_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_org_id', true)::uuid);

-- ============================================================================
-- Inmutabilidad (documento de cumplimiento, RF14): una vez emitido, un
-- certificado nunca se modifica ni se borra. Mismo patrón "más ligero" que
-- formalization_transitions/organization_documents (solo GRANT/REVOKE, sin
-- trigger — el trigger BEFORE UPDATE/DELETE que bloquea incluso a
-- superusuario queda reservado para audit_log).
-- ============================================================================
GRANT SELECT, INSERT ON "donation_certificates" TO adoptafacil_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "donation_certificates" FROM adoptafacil_app;

-- ============================================================================
-- Lectura cross-tenant por identidad del donante (mismo patrón que
-- donation_receipt_for_donor / adoption_contract_for_signer): el donante no es
-- miembro de la organización beneficiaria, así que necesita un camino sin
-- contexto de tenant que igual verifique identidad ANTES de devolver la fila
-- (nunca evade RLS de forma general, solo expone esta consulta acotada).
-- ============================================================================
CREATE OR REPLACE FUNCTION donation_certificate_for_donor(p_donation_id uuid, p_user_id uuid)
  RETURNS SETOF donation_certificates
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT c.*
  FROM donation_certificates c
  JOIN donations d ON d.id = c.donation_id
  WHERE c.donation_id = p_donation_id AND d.donor_user_id = p_user_id;
$$;

-- ============================================================================
-- Verificación PÚBLICA por código (mismo patrón que organization_public):
-- sin contexto de tenant, sin autenticación, superficie mínima — solo lo que
-- ya se muestra en la maqueta aprobada (T-053/F-CERT-REAL): organización,
-- NIT si es público, donante, monto, fecha y hash. Nunca ids internos.
-- ============================================================================
CREATE OR REPLACE FUNCTION donation_certificate_public(p_code text)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'code', c.code,
    'organizationName', c.payload->>'organizationName',
    'organizationNit', c.payload->>'organizationNit',
    'donorName', c.payload->>'donorName',
    'amount', (c.payload->>'amount')::int,
    'currency', c.payload->>'currency',
    'issuedAt', to_char(c.issued_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'contentHash', c.content_hash
  )
  FROM donation_certificates c
  WHERE c.code = p_code;
$$;

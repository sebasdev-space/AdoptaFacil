-- Comprobante de invitado vía "magic link" (M05, requisito FINAL del cliente:
-- tampoco obligar al donante invitado a crear cuenta para volver a consultar
-- su donación). Mismo patrón que password_reset_tokens (T-011): tabla de
-- lookup anónimo por token, NO bajo RLS, solo se guarda el HASH SHA-256 del
-- token. A diferencia de password_reset_tokens, NO es de un solo uso (no hay
-- used_at) — el donante puede volver a abrir el enlace mientras no expire.
--
-- NOTE (mismo patrón que las migraciones recientes de M05): el diff de Prisma
-- propuso además DROP de ~40 foreign keys añadidas a mano en migraciones
-- anteriores (org.prisma/animals.prisma/etc. no modelan esas relaciones), un
-- DROP INDEX de organizations_name_trgm_idx, un ALTER de
-- platform_settings.updated_at y un RENAME INDEX de sponsorship_payment_attempts,
-- todos ajenos a esta tarea. Ninguno va aquí: esta migración SOLO agrega
-- donation_access_links.

-- CreateTable
CREATE TABLE "donation_access_links" (
    "id" UUID NOT NULL,
    "donation_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donation_access_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "donation_access_links_token_hash_key" ON "donation_access_links"("token_hash");

-- AddForeignKey (FK a mano hacia donations, misma tabla/módulo M05 — SIN
-- relación Prisma a propósito, ver el comentario del modelo en donations.prisma).
ALTER TABLE "donation_access_links"
  ADD CONSTRAINT "donation_access_links_donation_id_fkey"
  FOREIGN KEY ("donation_id") REFERENCES "donations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- NOT bajo RLS (mismo razonamiento que password_reset_tokens): tabla de
-- lookup anónimo por token, no dato de negocio tenant-scoped — no lleva
-- organization_id. Grants completos para el rol de aplicación no-superusuario.
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON "donation_access_links" TO adoptafacil_app;

-- ============================================================================
-- Lectura cross-tenant POR ID DE DONACIÓN, sin contexto de tenant y sin
-- verificación adicional de identidad (mismo patrón SECURITY DEFINER que
-- donation_certificate_public/donation_receipt_for_donor) — aquí la identidad
-- YA fue verificada por el SERVICIO antes de llamarlas: solo se llega a estas
-- funciones después de resolver un `DonationAccessLink` válido y no expirado
-- por el HASH del token (el token es la credencial). Igual que el resto de
-- funciones de este módulo, cada una expone SOLO su propia tabla, acotada por
-- donation_id — nunca un listado ni una condición más amplia.
-- ============================================================================
CREATE OR REPLACE FUNCTION donation_by_id(p_donation_id uuid)
  RETURNS SETOF "donations"
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM "donations" WHERE "id" = p_donation_id;
$$;

CREATE OR REPLACE FUNCTION donation_receipt_by_donation(p_donation_id uuid)
  RETURNS SETOF "donation_receipts"
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM "donation_receipts" WHERE "donation_id" = p_donation_id;
$$;

CREATE OR REPLACE FUNCTION donation_certificate_by_donation(p_donation_id uuid)
  RETURNS SETOF "donation_certificates"
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM "donation_certificates" WHERE "donation_id" = p_donation_id;
$$;

REVOKE ALL ON FUNCTION donation_by_id(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION donation_receipt_by_donation(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION donation_certificate_by_donation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION donation_by_id(UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION donation_receipt_by_donation(UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION donation_certificate_by_donation(UUID) TO adoptafacil_app;

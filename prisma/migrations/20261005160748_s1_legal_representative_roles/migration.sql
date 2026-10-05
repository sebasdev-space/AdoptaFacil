-- NOTE (mismo patrón que la migración original de esta tabla,
-- 20260822225758_s1_legal_representative): el diff de Prisma propuso además
-- ~45 DROP de foreign keys no modeladas en los *.prisma, un DROP INDEX de
-- organizations_name_trgm_idx, un ALTER de platform_settings.updated_at y un
-- RENAME INDEX de sponsorship_payment_attempts, todo preexistente y sin
-- relación con esta tarea. Ninguno va aquí: esta migración SOLO agrega la
-- columna `role` (requerimiento #16 — permitir representante legal, contador
-- y revisor fiscal simultáneos) y reemplaza el índice de "vigente" por uno
-- que incluye `role`.

-- AlterTable
ALTER TABLE "legal_representatives" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'legal_representative';

-- DropIndex (superseded by the one below — "vigente" is now computed per
-- (organization_id, role), not per organization_id alone).
DROP INDEX "legal_representatives_organization_id_signed_at_idx";

-- CreateIndex
CREATE INDEX "legal_representatives_organization_id_role_signed_at_idx" ON "legal_representatives"("organization_id", "role", "signed_at");

-- ============================================================================
-- "Vigente" ahora es el `MAX(signed_at)` por (organization_id, role), no por
-- organization_id a secas — así registrar un contador o un revisor fiscal ya
-- no reemplaza al representante legal (ni viceversa). `p_role` tiene un
-- DEFAULT para no romper al único caller existente de un solo argumento.
--
-- Postgres identifica funciones por (nombre, tipos de parámetros): agregar un
-- segundo parámetro crea un OVERLOAD nuevo en vez de reemplazar el de un solo
-- argumento (CREATE OR REPLACE solo pisa una firma EXACTA) — hay que borrar la
-- vieja explícitamente o quedarían las dos, y la de un argumento seguiría
-- ignorando `role`.
-- ============================================================================
DROP FUNCTION IF EXISTS legal_representative_summary(UUID);

CREATE OR REPLACE FUNCTION legal_representative_summary(
    p_organization_id UUID,
    p_role TEXT DEFAULT 'legal_representative'
  )
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
    AND role = p_role
  ORDER BY signed_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION legal_representative_summary(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION legal_representative_summary(UUID, TEXT) TO adoptafacil_app;

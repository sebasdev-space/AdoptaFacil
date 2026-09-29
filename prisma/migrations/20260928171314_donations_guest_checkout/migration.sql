-- T-050-guest-checkout · M05 donations: checkout de INVITADO (requisito del
-- cliente, final — donar NO requiere cuenta ni login). `donor_user_id` pasa a
-- ser opcional (una donación puede no tener usuario vinculado) y se añade
-- `anonymous` (donación anónima FRENTE A LA ORGANIZACIÓN — AdoptaFácil sigue
-- conservando el dato real internamente para fines legales/certificado).
--
-- NOTE (mismo patrón que la migración original T-050): el diff de Prisma
-- propone además DROP de FKs añadidas a mano sobre tablas de otros módulos y
-- un ALTER de `platform_settings`/rename de índice ajenos a esta tarea. Esos
-- NO van aquí: esta migración SOLO toca los objetos propios de M05.

-- AlterTable: donations — donor_user_id ahora opcional; nueva columna anonymous.
ALTER TABLE "donations"
  ALTER COLUMN "donor_user_id" DROP NOT NULL,
  ADD COLUMN "anonymous" BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- create_donation gana un parámetro (p_anonymous). Los demás parámetros/columnas
-- se mantienen EXACTAMENTE en el mismo orden (llamadores posicionales, tanto
-- Prisma como el raw SQL del servicio). Postgres identifica una función por
-- nombre + tipos de parámetros, así que un parámetro nuevo es una firma
-- DISTINTA — se elimina la función vieja explícitamente en vez de dejar un
-- overload colgado.
-- ============================================================================
DROP FUNCTION IF EXISTS create_donation(UUID, UUID, TEXT, UUID, TEXT, INTEGER, INTEGER, JSONB, TEXT, TEXT, JSONB);

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
  p_payer JSONB,
  p_anonymous BOOLEAN
)
  RETURNS SETOF "donations"
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE d "donations";
BEGIN
  INSERT INTO "donations" (
    "id", "organization_id", "donor_user_id", "concept_kind", "concept_id",
    "commission_payer", "intended_amount", "amount_charged", "currency",
    "breakdown", "collection_id", "idempotency_key", "status", "payer", "anonymous", "updated_at"
  ) VALUES (
    gen_random_uuid(), p_organization_id, p_donor_user_id, p_concept_kind, p_concept_id,
    p_commission_payer, p_intended_amount, p_amount_charged, 'COP',
    p_breakdown, p_collection_id, p_idempotency_key, 'pending', p_payer, p_anonymous, CURRENT_TIMESTAMP
  )
  ON CONFLICT ("organization_id", "idempotency_key") DO NOTHING;

  SELECT * INTO d FROM "donations"
    WHERE "organization_id" = p_organization_id AND "idempotency_key" = p_idempotency_key;
  RETURN NEXT d;
END;
$$;

REVOKE ALL ON FUNCTION create_donation(UUID, UUID, TEXT, UUID, TEXT, INTEGER, INTEGER, JSONB, TEXT, TEXT, JSONB, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_donation(UUID, UUID, TEXT, UUID, TEXT, INTEGER, INTEGER, JSONB, TEXT, TEXT, JSONB, BOOLEAN) TO adoptafacil_app;

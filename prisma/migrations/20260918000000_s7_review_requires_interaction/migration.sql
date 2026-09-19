-- M12 · reputación (RF23) — QA hallazgo en vivo: `create_review` solo validaba
-- el rating y que la organización existiera, NUNCA que el autor hubiera
-- tenido una interacción real con ella. Cualquier persona autenticada podía
-- calificar CUALQUIER organización sin haber sido nunca adoptante, donante ni
-- padrino — el único freno existente (`reviews_organization_id_author_user_id_key`)
-- evita una SEGUNDA reseña, no la primera sin fundamento.
--
-- Esta migración reemplaza `create_review` (CREATE OR REPLACE, la original de
-- 20260824090000_s7_reputation_module queda intacta) para exigir AL MENOS UNA
-- de estas interacciones reales entre el autor y la organización reseñada:
--   1) una `adoption_requests` con status = 'approved';
--   2) una `donations` con status = 'approved';
--   3) un `sponsorships` con al menos un `sponsorship_payments` en status = 'paid'.
--
-- Decisión sobre apadrinamiento (punto 1 del prompt): NO basta con que exista
-- la fila en `sponsorships`. `Sponsorship.status` es solo 'active' | 'suspended'
-- | 'cancelled' y no dice si alguna vez se cobró algo real: una suscripción
-- reciente puede no tener todavía ningún período abierto por el job diario
-- (`nextBillingAt` en el futuro), y una suspendida por
-- BILLING_FAILURE_SUSPENSION_REASON (S-5-REDISEÑO) puede corresponder a un
-- padrino que JAMÁS pagó un solo período (los 3 intentos del primer período
-- fallaron). El dato real y verificable de que "hubo dinero de por medio" es
-- `sponsorship_payments.status = 'paid'` (mismo criterio que donations/
-- adoption_requests: se exige el estado que representa la transacción
-- efectivamente completada, no la mera existencia de un registro de intención).
CREATE OR REPLACE FUNCTION create_review(
  p_organization_id UUID,
  p_author_user_id UUID,
  p_rating INTEGER,
  p_comment TEXT,
  p_is_anonymous BOOLEAN
)
  RETURNS SETOF "reviews"
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  r "reviews";
  v_has_interaction BOOLEAN;
BEGIN
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'create_review: rating must be between 1 and 5';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = p_organization_id) THEN
    RETURN; -- unknown org ⇒ no-op (app throws 404)
  END IF;

  SELECT
    EXISTS (
      SELECT 1 FROM "adoption_requests"
      WHERE "organization_id" = p_organization_id
        AND "applicant_user_id" = p_author_user_id
        AND "status" = 'approved'
    )
    OR EXISTS (
      SELECT 1 FROM "donations"
      WHERE "organization_id" = p_organization_id
        AND "donor_user_id" = p_author_user_id
        AND "status" = 'approved'
    )
    OR EXISTS (
      SELECT 1
      FROM "sponsorships" s
      JOIN "sponsorship_payments" sp ON sp."sponsorship_id" = s."id"
      WHERE s."organization_id" = p_organization_id
        AND s."sponsor_user_id" = p_author_user_id
        AND sp."status" = 'paid'
    )
  INTO v_has_interaction;

  IF NOT v_has_interaction THEN
    RAISE EXCEPTION
      'create_review: author has no completed adoption, donation or sponsorship payment with this organization (RF23)'
      USING ERRCODE = 'restrict_violation';
  END IF;

  INSERT INTO "reviews" (
    "id", "organization_id", "author_user_id", "rating", "comment",
    "is_anonymous", "status", "created_at"
  ) VALUES (
    gen_random_uuid(), p_organization_id, p_author_user_id, p_rating,
    NULLIF(btrim(COALESCE(p_comment, '')), ''), COALESCE(p_is_anonymous, false),
    'pending', CURRENT_TIMESTAMP
  )
  RETURNING * INTO r;

  RETURN NEXT r;
END;
$$;

REVOKE ALL ON FUNCTION create_review(UUID, UUID, INTEGER, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_review(UUID, UUID, INTEGER, TEXT, BOOLEAN) TO adoptafacil_app;

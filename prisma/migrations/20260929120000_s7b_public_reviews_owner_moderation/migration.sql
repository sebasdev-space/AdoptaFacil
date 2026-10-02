-- M12 · reputación (RF23, S7-b) — hallazgo del cliente: el portal público no
-- tenía NINGUNA forma de registrar una reseña (`create_review` exige sesión +
-- una interacción real -adopción/donación/apadrinamiento- con la organización,
-- S7). El cliente pide un flujo nuevo y deliberadamente distinto, en paralelo:
--   1) botón "Registrar reseña" en el portal público, SIN sesión, anónimo por
--      diseño (no hay ninguna identidad que capturar) — `create_public_review`.
--   2) visible de inmediato (el cliente: "cuando se registre, este se debe
--      mostrar en el portal público") — se inserta ya `approved`, sin pasar
--      por la cola de PlatformAdmin (`platform_review_queue` la excluye
--      explícitamente más abajo).
--   3) el ÚNICO moderador de ESTAS reseñas es el Owner/Administrator de la
--      organización reseñada ("marcar como spam"), vía `owner_mark_review_spam`.
--      Esto es una excepción deliberada y ACOTADA al conflicto de interés que
--      S-7 evita (`platform_review_*`, "la organización reseñada NUNCA modera
--      sus propias reseñas"): esa regla se mantiene INTACTA para las reseñas
--      autenticadas de `create_review` (author_user_id NOT NULL) — el Owner
--      jamás puede tocarlas, `owner_mark_review_spam` solo opera sobre filas
--      con `author_user_id IS NULL`.
--
-- `author_user_id` pasa a ser NULLABLE (antes NOT NULL) exclusivamente para
-- estas filas anónimas; el camino autenticado original queda sin cambios.

ALTER TABLE "reviews" ALTER COLUMN "author_user_id" DROP NOT NULL;

-- ============================================================================
-- Creación pública, sin sesión: cualquier visitante del portal, una vez por
-- envío (no hay identidad para deduplicar — el cliente aceptó este trade-off
-- explícitamente al pedir "no necesita estar registrado de ninguna forma").
-- Queda `approved` de inmediato, nunca `pending`.
-- ============================================================================
CREATE OR REPLACE FUNCTION create_public_review(
  p_organization_id UUID,
  p_rating INTEGER,
  p_comment TEXT
)
  RETURNS SETOF "reviews"
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  r "reviews";
BEGIN
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'create_public_review: rating must be between 1 and 5';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = p_organization_id) THEN
    RETURN; -- unknown org ⇒ no-op (app throws 404)
  END IF;

  INSERT INTO "reviews" (
    "id", "organization_id", "author_user_id", "rating", "comment",
    "is_anonymous", "status", "created_at"
  ) VALUES (
    gen_random_uuid(), p_organization_id, NULL, p_rating,
    NULLIF(btrim(COALESCE(p_comment, '')), ''), true,
    'approved', CURRENT_TIMESTAMP
  )
  RETURNING * INTO r;

  INSERT INTO audit_logs (
    id, organization_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
  ) VALUES (
    gen_random_uuid(), r.organization_id, NULL, 'reputation.public_review_created',
    'review', r.id::text, jsonb_build_object('rating', r.rating), CURRENT_TIMESTAMP
  );

  RETURN NEXT r;
END;
$$;

REVOKE ALL ON FUNCTION create_public_review(UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_public_review(UUID, INTEGER, TEXT) TO adoptafacil_app;

-- ============================================================================
-- Moderación del Owner/Administrator de LA PROPIA organización — únicamente
-- sobre reseñas públicas/anónimas (author_user_id IS NULL). Tenant-scoped: se
-- exige que `p_organization_id` (resuelto del JWT del actor) coincida con la
-- reseña, igual que cualquier RLS normal — necesario porque esta función es
-- SECURITY DEFINER y por tanto bypassa la política `tenant_isolation`.
-- ============================================================================
CREATE OR REPLACE FUNCTION owner_mark_review_spam(
  p_review_id UUID,
  p_organization_id UUID,
  p_actor_user_id UUID
)
  RETURNS JSONB
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_row "reviews"%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM "reviews" WHERE id = p_review_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review not found';
  END IF;
  IF v_row.organization_id <> p_organization_id THEN
    -- Misma respuesta que "not found": nunca reveles que el id existe en OTRA org.
    RAISE EXCEPTION 'review not found';
  END IF;
  IF v_row.author_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'only a public (anonymous) review can be marked as spam by the organization';
  END IF;
  IF v_row.status <> 'approved' THEN
    RAISE EXCEPTION 'only an approved review can be marked as spam (status=%)', v_row.status;
  END IF;

  UPDATE "reviews"
     SET status = 'hidden',
         rejection_reason = 'spam',
         moderated_by_user_id = p_actor_user_id,
         moderated_at = CURRENT_TIMESTAMP
   WHERE id = p_review_id
   RETURNING * INTO v_row;

  INSERT INTO audit_logs (
    id, organization_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
  ) VALUES (
    gen_random_uuid(), v_row.organization_id, p_actor_user_id, 'reputation.public_review_marked_spam',
    'review', v_row.id::text, jsonb_build_object('reason', 'spam'), CURRENT_TIMESTAMP
  );

  RETURN jsonb_build_object(
    'id', v_row.id,
    'organizationId', v_row.organization_id,
    'authorUserId', v_row.author_user_id,
    'rating', v_row.rating,
    'comment', v_row.comment,
    'isAnonymous', v_row.is_anonymous,
    'status', v_row.status,
    'moderatedByUserId', v_row.moderated_by_user_id,
    'moderatedAt', v_row.moderated_at,
    'rejectionReason', v_row.rejection_reason,
    'createdAt', v_row.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION owner_mark_review_spam(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION owner_mark_review_spam(UUID, UUID, UUID) TO adoptafacil_app;

-- ============================================================================
-- `platform_review_queue()`: excluir explícitamente las reseñas públicas
-- (author_user_id IS NULL) — las modera el Owner (arriba), nunca PlatformAdmin.
-- Sin este filtro el INNER JOIN a `users` ya las descartaría implícitamente,
-- pero se deja explícito para que el comportamiento no dependa de un
-- accidente del JOIN.
-- ============================================================================
CREATE OR REPLACE FUNCTION platform_review_queue()
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'organizationId', r.organization_id,
        'organizationName', o.name,
        'authorUserId', r.author_user_id,
        'authorName', u.display_name,
        'rating', r.rating,
        'comment', r.comment,
        'isAnonymous', r.is_anonymous,
        'status', r.status,
        'moderatedByUserId', r.moderated_by_user_id,
        'moderatedAt', r.moderated_at,
        'rejectionReason', r.rejection_reason,
        'createdAt', r.created_at
      )
      ORDER BY r.created_at
    ),
    '[]'::jsonb
  )
  FROM "reviews" r
  JOIN organizations o ON o.id = r.organization_id
  JOIN users u ON u.id = r.author_user_id
  WHERE r.status IN ('pending', 'approved') AND r.author_user_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION platform_review_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_review_queue() TO adoptafacil_app;

-- ============================================================================
-- `public_approved_reviews()`: LEFT JOIN a `users` (antes INNER) — una reseña
-- pública/anónima (author_user_id NULL) nunca hace match contra `users` y el
-- INNER JOIN original la descartaría por completo del portal. `is_anonymous`
-- ya es true en todas estas filas, así que el CASE existente sigue ocultando
-- el nombre correctamente (aquí no hay nombre que ocultar).
-- ============================================================================
CREATE OR REPLACE FUNCTION public_approved_reviews(
  p_organization_id UUID,
  p_limit INTEGER,
  p_offset INTEGER
)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'items', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', x.id,
            'rating', x.rating,
            'comment', x.comment,
            'authorName', CASE WHEN x.is_anonymous THEN NULL ELSE x.display_name END,
            'createdAt', x.created_at
          )
          ORDER BY x.created_at DESC
        )
        FROM (
          SELECT r.id, r.rating, r.comment, r.is_anonymous, r.created_at, u.display_name
          FROM "reviews" r
          LEFT JOIN users u ON u.id = r.author_user_id
          WHERE r.organization_id = p_organization_id AND r.status = 'approved'
          ORDER BY r.created_at DESC
          LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
          OFFSET GREATEST(COALESCE(p_offset, 0), 0)
        ) x
      ),
      '[]'::jsonb
    ),
    'total', (
      SELECT COUNT(*) FROM "reviews"
      WHERE organization_id = p_organization_id AND status = 'approved'
    )
  );
$$;

REVOKE ALL ON FUNCTION public_approved_reviews(UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_approved_reviews(UUID, INTEGER, INTEGER) TO adoptafacil_app;

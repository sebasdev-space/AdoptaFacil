-- NOTE (mismo patrón que las migraciones anteriores de esta sesión): el diff
-- de Prisma propone además ~40 DROP de foreign keys no modeladas en los
-- *.prisma y otros cambios preexistentes sin relación con esta tarea.
-- Ninguno va aquí: esta migración SOLO relaja la condición de estado de
-- `adoption_contract_apply_signatures`.
--
-- ============================================================================
-- Nuevo flujo de firma (M04, T-028b): "diligenciar los datos, firmar de
-- representante y LUEGO enviarlo a firma del adoptante" — el representante de
-- la organización ahora firma MIENTRAS el contrato sigue en `draft` (antes de
-- la transición `draft -> pending_signatures`, que a su vez queda bloqueada
-- en el service hasta que el representante ya firmó). El adoptante sigue
-- firmando solo en `pending_signatures`, igual que antes. La función original
-- solo aceptaba `status = 'pending_signatures'`, lo que habría rechazado
-- silenciosamente (0 filas) la firma del representante en `draft`.
--
-- Sigue sin tocar contratos `signed`/`cancelled` (ninguno de los dos aparece
-- en el IN) ni cambiar el resto de la lógica (sellado, hash, `signed_at`).
-- ============================================================================
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
    AND "status" IN ('draft', 'pending_signatures')
    AND "signers" @> jsonb_build_array(jsonb_build_object('userId', p_user_id::text))
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION adoption_contract_apply_signatures(UUID, UUID, JSONB, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION adoption_contract_apply_signatures(UUID, UUID, JSONB, BOOLEAN, TEXT) TO adoptafacil_app;

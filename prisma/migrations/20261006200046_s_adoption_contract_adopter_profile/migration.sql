-- NOTE (mismo patrón que las últimas dos migraciones hand-written de esta
-- sesión): el diff de Prisma propone además ~40 DROP de foreign keys no
-- modeladas en los *.prisma y otros cambios preexistentes sin relación con
-- esta tarea. Ninguno va aquí: esta migración SOLO agrega UNA función.
--
-- ============================================================================
-- Nuevo requerimiento (adopciones, M04, T-028b): al generar el contrato de
-- adopción, la organización necesita el documento de identidad y el domicilio
-- del ADOPTANTE para rellenar la plantilla legal — esos datos viven en el
-- `users` row del adoptante, que pertenece a SU PROPIO tenant (nunca el de la
-- organización que genera el contrato). Mismo motivo que ya tienen
-- `volunteer_certificates_for_user`/`adoption_contract_for_signer`: un
-- SECURITY DEFINER acotado que expone SOLO las dos columnas necesarias,
-- nunca una lectura cross-tenant directa. `NULL`/ausente (nunca error) si el
-- adoptante aún no completó su perfil — la organización puede rellenarlo a
-- mano en ese caso.
-- ============================================================================
CREATE OR REPLACE FUNCTION adopter_profile_for_contract(p_user_id UUID)
  RETURNS TABLE(document_id TEXT, address TEXT)
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT document_id, address
  FROM "users"
  WHERE id = p_user_id;
$$;

REVOKE ALL ON FUNCTION adopter_profile_for_contract(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION adopter_profile_for_contract(UUID) TO adoptafacil_app;

-- NOTE (mismo patrón que la migración anterior,
-- 20261005160748_s1_legal_representative_roles): el diff de Prisma propuso
-- además ~40 DROP de foreign keys no modeladas en los *.prisma, un DROP INDEX
-- de organizations_name_trgm_idx, un ALTER de platform_settings.updated_at y
-- un RENAME INDEX de sponsorship_payment_attempts, todo preexistente y sin
-- relación con esta tarea. Ninguno va aquí: esta migración SOLO reemplaza el
-- cuerpo de `create_service_hours` (mismo signature, ninguna tabla/columna
-- cambia) para el nuevo requerimiento: un voluntario no puede registrar más
-- horas sobre una inscripción para la que la organización ya emitió un
-- certificado.
--
-- ============================================================================
-- Requerimiento (voluntariado, M08): "por parte del voluntario no debe
-- permitirle registrar más horas si ya tiene un certificado emitido por la
-- organización". `volunteer_certificates.enrollment_id` tiene un UNIQUE INDEX
-- (a lo sumo un certificado por inscripción, ver la migración original de la
-- tabla) — un simple EXISTS alcanza. El check vive DENTRO de la función
-- (SECURITY DEFINER, cross-tenant) en vez de en la capa de TypeScript porque
-- el voluntario nunca es miembro de la organización: no hay `withOrgContext`
-- disponible para una consulta ORM directa a `volunteer_certificates` (la
-- misma razón por la que ya existe `volunteer_certificates_for_user`). Un
-- RAISE EXCEPTION con un mensaje reconocible deja que la capa de servicio
-- (`ServiceHoursService.log`) lo traduzca a un 400 claro, mismo patrón que
-- `community_comments`/`community_posts` ya usan para sus propias reglas.
-- ============================================================================
CREATE OR REPLACE FUNCTION create_service_hours(
  p_enrollment_id UUID,
  p_volunteer_user_id UUID,
  p_date TIMESTAMP,
  p_hours DOUBLE PRECISION,
  p_description TEXT
)
  RETURNS SETOF "service_hours"
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  h "service_hours";
  v_org UUID;
  v_owner UUID;
  v_status TEXT;
BEGIN
  SELECT organization_id, volunteer_user_id, status
    INTO v_org, v_owner, v_status
    FROM "volunteer_enrollments" WHERE id = p_enrollment_id;
  IF NOT FOUND OR v_owner <> p_volunteer_user_id OR v_status <> 'accepted' THEN
    RETURN; -- not yours, unknown, or not accepted yet ⇒ no-op (app throws)
  END IF;

  IF EXISTS (SELECT 1 FROM "volunteer_certificates" WHERE enrollment_id = p_enrollment_id) THEN
    RAISE EXCEPTION 'a certificate has already been issued for this enrollment';
  END IF;

  INSERT INTO "service_hours" (
    "id", "organization_id", "enrollment_id", "volunteer_user_id",
    "date", "hours", "description", "status", "created_at"
  ) VALUES (
    gen_random_uuid(), v_org, p_enrollment_id, p_volunteer_user_id,
    p_date, p_hours, p_description, 'pending', CURRENT_TIMESTAMP
  )
  RETURNING * INTO h;

  RETURN NEXT h;
END;
$$;

REVOKE ALL ON FUNCTION create_service_hours(UUID, UUID, TIMESTAMP, DOUBLE PRECISION, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_service_hours(UUID, UUID, TIMESTAMP, DOUBLE PRECISION, TEXT) TO adoptafacil_app;

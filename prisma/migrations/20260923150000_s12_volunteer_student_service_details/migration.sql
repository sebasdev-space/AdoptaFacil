-- S-12 (M08, FSD v3.5 Doc 8) — completes the student social service
-- constancia: guardian identity (for minors), school + institutional
-- agreement, and a day-by-day bitácora snapshotted onto the certificate.

-- AlterTable: volunteer_enrollments — captured at signup, not required there
-- (see the Prisma doc comment); the gate is at certificate issuance.
ALTER TABLE "volunteer_enrollments"
  ADD COLUMN "is_minor" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "guardian_name" TEXT,
  ADD COLUMN "guardian_document" TEXT,
  ADD COLUMN "school_name" TEXT,
  ADD COLUMN "school_agreement_code" TEXT;

-- AlterTable: volunteer_certificates — snapshotted at issuance, append-only
-- same as every other column on this table (no grant/trigger changes needed:
-- the existing SELECT+INSERT-only grant and no-mutation triggers already
-- cover these new columns since they're only ever set on INSERT).
ALTER TABLE "volunteer_certificates"
  ADD COLUMN "guardian_name" TEXT,
  ADD COLUMN "guardian_document" TEXT,
  ADD COLUMN "school_name" TEXT,
  ADD COLUMN "school_agreement_code" TEXT,
  ADD COLUMN "bitacora" JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ============================================================================
-- create_volunteer_enrollment — signature changes (5 new optional params), so
-- this needs DROP + CREATE, not a plain CREATE OR REPLACE (Postgres rejects
-- replacing a function with a different parameter list).
-- ============================================================================
DROP FUNCTION IF EXISTS create_volunteer_enrollment(UUID, UUID);

CREATE OR REPLACE FUNCTION create_volunteer_enrollment(
  p_opportunity_id UUID,
  p_volunteer_user_id UUID,
  p_is_minor BOOLEAN DEFAULT false,
  p_guardian_name TEXT DEFAULT NULL,
  p_guardian_document TEXT DEFAULT NULL,
  p_school_name TEXT DEFAULT NULL,
  p_school_agreement_code TEXT DEFAULT NULL
)
  RETURNS SETOF "volunteer_enrollments"
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  e "volunteer_enrollments";
  v_org UUID;
  v_applies BOOLEAN;
  v_status TEXT;
  v_name TEXT;
  v_email TEXT;
BEGIN
  SELECT organization_id, applies_to_student_service, status
    INTO v_org, v_applies, v_status
    FROM "volunteer_opportunities" WHERE id = p_opportunity_id;
  IF NOT FOUND OR v_status <> 'active' THEN
    RETURN; -- unknown or inactive opportunity ⇒ no-op (app throws 404)
  END IF;

  SELECT display_name, email INTO v_name, v_email
    FROM "users" WHERE id = p_volunteer_user_id;

  INSERT INTO "volunteer_enrollments" (
    "id", "organization_id", "opportunity_id", "volunteer_user_id",
    "volunteer_name", "volunteer_email",
    "applies_to_student_service", "status", "created_at",
    "is_minor", "guardian_name", "guardian_document",
    "school_name", "school_agreement_code"
  ) VALUES (
    gen_random_uuid(), v_org, p_opportunity_id, p_volunteer_user_id,
    v_name, v_email,
    v_applies, 'pending', CURRENT_TIMESTAMP,
    p_is_minor, p_guardian_name, p_guardian_document,
    p_school_name, p_school_agreement_code
  )
  RETURNING * INTO e;

  RETURN NEXT e;
END;
$$;

REVOKE ALL ON FUNCTION create_volunteer_enrollment(UUID, UUID, BOOLEAN, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_volunteer_enrollment(UUID, UUID, BOOLEAN, TEXT, TEXT, TEXT, TEXT) TO adoptafacil_app;

-- ============================================================================
-- volunteer_enrollments_for_user — same signature (JSONB return, no params
-- changed), plain CREATE OR REPLACE is safe.
-- ============================================================================
CREATE OR REPLACE FUNCTION volunteer_enrollments_for_user(p_user_id UUID)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'organizationId', e.organization_id,
        'organizationName', o.name,
        'opportunityId', e.opportunity_id,
        'opportunityTitle', vo.title,
        'volunteerUserId', e.volunteer_user_id,
        'appliesToStudentService', e.applies_to_student_service,
        'status', e.status,
        'rejectionReason', e.rejection_reason,
        'decidedByUserId', e.decided_by_user_id,
        'decidedAt', e.decided_at,
        'createdAt', e.created_at,
        'isMinor', e.is_minor,
        'guardianName', e.guardian_name,
        'guardianDocument', e.guardian_document,
        'schoolName', e.school_name,
        'schoolAgreementCode', e.school_agreement_code
      )
      ORDER BY e.created_at DESC
    ),
    '[]'::jsonb
  )
  FROM "volunteer_enrollments" e
  JOIN "volunteer_opportunities" vo ON vo.id = e.opportunity_id
  JOIN "organizations" o ON o.id = e.organization_id
  WHERE e.volunteer_user_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION volunteer_enrollments_for_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION volunteer_enrollments_for_user(UUID) TO adoptafacil_app;

-- ============================================================================
-- volunteer_certificates_for_user — same signature, plain CREATE OR REPLACE.
-- ============================================================================
CREATE OR REPLACE FUNCTION volunteer_certificates_for_user(p_user_id UUID)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'organizationId', c.organization_id,
        'enrollmentId', c.enrollment_id,
        'volunteerUserId', c.volunteer_user_id,
        'volunteerName', c.volunteer_name,
        'organizationName', c.organization_name,
        'opportunityTitle', c.opportunity_title,
        'totalApprovedHours', c.total_approved_hours,
        'periodStart', c.period_start,
        'periodEnd', c.period_end,
        'appliesToStudentService', c.applies_to_student_service,
        'issuedByUserId', c.issued_by_user_id,
        'issuedAt', c.issued_at,
        'guardianName', c.guardian_name,
        'guardianDocument', c.guardian_document,
        'schoolName', c.school_name,
        'schoolAgreementCode', c.school_agreement_code,
        'bitacora', c.bitacora
      )
      ORDER BY c.issued_at DESC
    ),
    '[]'::jsonb
  )
  FROM "volunteer_certificates" c
  WHERE c.volunteer_user_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION volunteer_certificates_for_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION volunteer_certificates_for_user(UUID) TO adoptafacil_app;

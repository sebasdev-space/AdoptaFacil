-- CreateTable
CREATE TABLE "volunteer_opportunities" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER,
    "location" TEXT NOT NULL,
    "requirements" TEXT,
    "applies_to_student_service" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "volunteer_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_enrollments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "opportunity_id" UUID NOT NULL,
    "volunteer_user_id" UUID NOT NULL,
    "volunteer_name" TEXT NOT NULL,
    "volunteer_email" TEXT NOT NULL,
    "applies_to_student_service" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "decided_by_user_id" UUID,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "volunteer_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_hours" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "volunteer_user_id" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "decided_by_user_id" UUID,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_certificates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "volunteer_user_id" UUID NOT NULL,
    "volunteer_name" TEXT NOT NULL,
    "organization_name" TEXT NOT NULL,
    "opportunity_title" TEXT NOT NULL,
    "total_approved_hours" DOUBLE PRECISION NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "applies_to_student_service" BOOLEAN NOT NULL,
    "issued_by_user_id" UUID NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "volunteer_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "volunteer_opportunities_organization_id_idx" ON "volunteer_opportunities"("organization_id");

-- CreateIndex
CREATE INDEX "volunteer_opportunities_organization_id_status_idx" ON "volunteer_opportunities"("organization_id", "status");

-- CreateIndex
CREATE INDEX "volunteer_enrollments_organization_id_idx" ON "volunteer_enrollments"("organization_id");

-- CreateIndex
CREATE INDEX "volunteer_enrollments_opportunity_id_idx" ON "volunteer_enrollments"("opportunity_id");

-- CreateIndex
CREATE INDEX "volunteer_enrollments_volunteer_user_id_idx" ON "volunteer_enrollments"("volunteer_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "volunteer_enrollments_opportunity_id_volunteer_user_id_key" ON "volunteer_enrollments"("opportunity_id", "volunteer_user_id");

-- CreateIndex
CREATE INDEX "service_hours_organization_id_idx" ON "service_hours"("organization_id");

-- CreateIndex
CREATE INDEX "service_hours_enrollment_id_idx" ON "service_hours"("enrollment_id");

-- CreateIndex
CREATE INDEX "service_hours_volunteer_user_id_idx" ON "service_hours"("volunteer_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "volunteer_certificates_enrollment_id_key" ON "volunteer_certificates"("enrollment_id");

-- CreateIndex
CREATE INDEX "volunteer_certificates_organization_id_idx" ON "volunteer_certificates"("organization_id");

-- CreateIndex
CREATE INDEX "volunteer_certificates_volunteer_user_id_idx" ON "volunteer_certificates"("volunteer_user_id");

-- AddForeignKey
ALTER TABLE "volunteer_enrollments" ADD CONSTRAINT "volunteer_enrollments_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "volunteer_opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_hours" ADD CONSTRAINT "service_hours_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "volunteer_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_certificates" ADD CONSTRAINT "volunteer_certificates_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "volunteer_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- VOLUNTEERING MODULE (M08, RF18/RF19) — cross-module FKs (organizations/
-- users, both owned by the same developer but a different schema file — kept
-- SQL-only, same convention as campaigns/sponsorships), RLS, and RBAC
-- least-privilege grants on all 4 tables.
-- ============================================================================

ALTER TABLE "volunteer_opportunities" ADD CONSTRAINT "volunteer_opportunities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "volunteer_enrollments" ADD CONSTRAINT "volunteer_enrollments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "volunteer_enrollments" ADD CONSTRAINT "volunteer_enrollments_volunteer_user_id_fkey" FOREIGN KEY ("volunteer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_hours" ADD CONSTRAINT "service_hours_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_hours" ADD CONSTRAINT "service_hours_volunteer_user_id_fkey" FOREIGN KEY ("volunteer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "volunteer_certificates" ADD CONSTRAINT "volunteer_certificates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "volunteer_certificates" ADD CONSTRAINT "volunteer_certificates_volunteer_user_id_fkey" FOREIGN KEY ("volunteer_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 1. Tenant RLS (same canonical policy as every other business table) on all
--    4 tables. `volunteer_opportunities`/`volunteer_enrollments`/
--    `service_hours` are regular (mutable) tenant tables; `volunteer_certificates`
--    gets its extra append-only hardening in section 3 below.
ALTER TABLE "volunteer_opportunities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "volunteer_opportunities" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "volunteer_opportunities"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "volunteer_enrollments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "volunteer_enrollments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "volunteer_enrollments"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "service_hours" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_hours" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "service_hours"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "volunteer_certificates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "volunteer_certificates" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "volunteer_certificates"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- 2. Grants: opportunities/enrollments/service_hours are regular mutable
--    tenant tables (accept/reject, decide hours — a normal RLS-scoped UPDATE
--    by the owning org, never a cross-tenant write).
GRANT SELECT, INSERT, UPDATE ON "volunteer_opportunities" TO adoptafacil_app;
GRANT SELECT, INSERT, UPDATE ON "volunteer_enrollments" TO adoptafacil_app;
GRANT SELECT, INSERT, UPDATE ON "service_hours" TO adoptafacil_app;

-- 3. `volunteer_certificates` is APPEND-ONLY (same convention as
--    `campaign_evidences` post-S-4, `dian_verification_attempts`,
--    `legal_representatives`): a school/volunteer must be able to trust that
--    an issued certificate never changes. The app role gets only
--    SELECT+INSERT; DB triggers reject UPDATE/DELETE/TRUNCATE for EVERY role
--    (incl. superuser, normal path).
GRANT SELECT, INSERT ON "volunteer_certificates" TO adoptafacil_app;

CREATE OR REPLACE FUNCTION volunteer_certificates_reject_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'volunteer_certificates is append-only: % is not permitted (RF18/RF19)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER volunteer_certificates_no_update
  BEFORE UPDATE ON "volunteer_certificates"
  FOR EACH ROW EXECUTE FUNCTION volunteer_certificates_reject_mutation();

CREATE TRIGGER volunteer_certificates_no_delete
  BEFORE DELETE ON "volunteer_certificates"
  FOR EACH ROW EXECUTE FUNCTION volunteer_certificates_reject_mutation();

CREATE TRIGGER volunteer_certificates_no_truncate
  BEFORE TRUNCATE ON "volunteer_certificates"
  FOR EACH STATEMENT EXECUTE FUNCTION volunteer_certificates_reject_mutation();

-- ============================================================================
-- CROSS-TENANT ACCESSORS — controlled exceptions to RLS (same convention as
-- `create_sponsorship`/`sponsorships_for_sponsor`, T-056). A volunteer is
-- never a member of the opportunity's organization, so enrollment/hours
-- creation and "mine" reads cannot go through the regular RLS-scoped path.
-- EXECUTE is granted solely to the app role.
-- ============================================================================

-- Enroll in an opportunity (cross-tenant). Validates the opportunity exists
-- and is active, snapshots `applies_to_student_service` from it, and inserts
-- atomically. Returns nothing (⇒ 404) if the opportunity is unknown/closed;
-- the caller's own UNIQUE(opportunity_id, volunteer_user_id) constraint
-- rejects a duplicate signup (⇒ 409 at the app layer).
CREATE OR REPLACE FUNCTION create_volunteer_enrollment(
  p_opportunity_id UUID,
  p_volunteer_user_id UUID
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
    "applies_to_student_service", "status", "created_at"
  ) VALUES (
    gen_random_uuid(), v_org, p_opportunity_id, p_volunteer_user_id,
    v_name, v_email,
    v_applies, 'pending', CURRENT_TIMESTAMP
  )
  RETURNING * INTO e;

  RETURN NEXT e;
END;
$$;

REVOKE ALL ON FUNCTION create_volunteer_enrollment(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_volunteer_enrollment(UUID, UUID) TO adoptafacil_app;

-- Log a service-hours session against the volunteer's OWN enrollment
-- (cross-tenant). Only allowed when the enrollment belongs to that volunteer
-- AND is currently `accepted` — returns nothing otherwise (⇒ 404/400 at the
-- app layer, which distinguishes "not yours"/"unknown" from "not accepted
-- yet" by re-checking before calling this).
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

-- "Mis inscripciones" (cross-tenant, by identity) — every enrollment of ONE
-- volunteer across ALL organizations, enriched with the names a volunteer
-- needs to recognize their own enrollment (never trusted from the client).
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
        'createdAt', e.created_at
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

-- "Mis horas" (cross-tenant, by identity) — every service-hours session of
-- ONE volunteer across ALL organizations/enrollments.
CREATE OR REPLACE FUNCTION service_hours_for_user(p_user_id UUID)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', h.id,
        'organizationId', h.organization_id,
        'enrollmentId', h.enrollment_id,
        'volunteerUserId', h.volunteer_user_id,
        'date', h.date,
        'hours', h.hours,
        'description', h.description,
        'status', h.status,
        'rejectionReason', h.rejection_reason,
        'decidedByUserId', h.decided_by_user_id,
        'decidedAt', h.decided_at,
        'createdAt', h.created_at
      )
      ORDER BY h.date DESC
    ),
    '[]'::jsonb
  )
  FROM "service_hours" h
  WHERE h.volunteer_user_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION service_hours_for_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION service_hours_for_user(UUID) TO adoptafacil_app;

-- "Mis certificados" (cross-tenant, by identity) — every certificate issued
-- to ONE volunteer across ALL organizations.
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
        'issuedAt', c.issued_at
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

-- Single-certificate read for EITHER kind of legitimate viewer: the
-- certificate's OWN volunteer, or a member of the ISSUING organization
-- (Owner/Administrator/ReadOnlyAuditor — role gating happens at the app
-- layer via RolesGuard on the SAME request already resolving org membership;
-- this function only decides WHOSE rows are visible, mirroring
-- `donation_certificate_for_donor`). Returns nothing for anyone else ⇒ 404.
-- Used by both `GET /volunteer-certificates/:id` and its `/pdf` sibling.
CREATE OR REPLACE FUNCTION volunteer_certificate_for_viewer(
  p_certificate_id UUID,
  p_viewer_user_id UUID,
  p_viewer_org_id UUID
)
  RETURNS SETOF "volunteer_certificates"
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT * FROM "volunteer_certificates"
  WHERE id = p_certificate_id
    AND (volunteer_user_id = p_viewer_user_id OR organization_id = p_viewer_org_id);
$$;

REVOKE ALL ON FUNCTION volunteer_certificate_for_viewer(UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION volunteer_certificate_for_viewer(UUID, UUID, UUID) TO adoptafacil_app;

-- The PER-ORG public listing (`GET /public/organizations/:slug/volunteer-
-- opportunities`) needs no dedicated SECURITY DEFINER function: it resolves
-- the slug via the EXISTING `organization_public(slug)` function (T-101),
-- then reads `volunteer_opportunities` through `withOrgContext(org.id, ...)`
-- — the exact same technique `PublicCampaignsService.listByOrgSlug` already
-- uses (S2-07). The GLOBAL public feed below (`GET /public/volunteer-
-- opportunities`, mirroring `public_campaigns`/`public_animals`) DOES need
-- one, since it scans ACROSS every organization's active opportunities.
CREATE OR REPLACE FUNCTION public_volunteer_opportunities(p_limit INTEGER, p_offset INTEGER)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'items', COALESCE(
      (
        SELECT jsonb_agg(item ORDER BY (item->>'startDate') ASC)
        FROM (
          SELECT jsonb_build_object(
            'id', vo.id,
            'organizationId', vo.organization_id,
            'organizationName', o.name,
            'title', vo.title,
            'description', vo.description,
            'category', vo.category,
            'startDate', vo.start_date,
            'endDate', vo.end_date,
            'capacity', vo.capacity,
            'location', vo.location,
            'requirements', vo.requirements,
            'appliesToStudentService', vo.applies_to_student_service
          ) AS item
          FROM volunteer_opportunities vo
          JOIN organizations o ON o.id = vo.organization_id
          WHERE vo.status = 'active'
          ORDER BY vo.start_date ASC
          LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
          OFFSET GREATEST(COALESCE(p_offset, 0), 0)
        ) page
      ),
      '[]'::jsonb
    ),
    'total', (SELECT count(*) FROM volunteer_opportunities WHERE status = 'active')
  );
$$;

REVOKE ALL ON FUNCTION public_volunteer_opportunities(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_volunteer_opportunities(INTEGER, INTEGER) TO adoptafacil_app;

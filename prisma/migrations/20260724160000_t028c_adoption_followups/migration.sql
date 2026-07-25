-- T-028c · M04 post-adoption FOLLOW-UP (RF12): milestones + evidence.
--
-- NOTE: as in T-028a/b, Prisma's diff may propose dropping hand-added FKs on other
-- modules' tables. Those are intentionally NOT here: this migration ONLY adds M04's
-- own follow-up objects.

-- CreateTable: milestones
CREATE TABLE "adoption_followup_milestones" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "adopter_user_id" UUID NOT NULL,
    "adopter_name" TEXT NOT NULL,
    "adopter_email" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "questionnaire" JSONB NOT NULL DEFAULT '[]',
    "due_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adoption_followup_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable: evidence
CREATE TABLE "adoption_followup_evidence" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "milestone_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "answers" JSONB,
    "storage_ref" TEXT,
    "storage_url" TEXT,
    "submitted_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adoption_followup_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "adoption_followup_milestones_organization_id_idx" ON "adoption_followup_milestones"("organization_id");
CREATE INDEX "adoption_followup_milestones_contract_id_idx" ON "adoption_followup_milestones"("contract_id");
CREATE INDEX "adoption_followup_milestones_adopter_user_id_idx" ON "adoption_followup_milestones"("adopter_user_id");
CREATE INDEX "adoption_followup_milestones_status_idx" ON "adoption_followup_milestones"("status");
CREATE INDEX "adoption_followup_evidence_organization_id_idx" ON "adoption_followup_evidence"("organization_id");
CREATE INDEX "adoption_followup_evidence_milestone_id_idx" ON "adoption_followup_evidence"("milestone_id");

-- AddForeignKey (fronteras M04→M01/M04): FK a mano (no modeladas en Prisma salvo
-- la relación milestone↔evidence, ambas M04).
ALTER TABLE "adoption_followup_milestones"
  ADD CONSTRAINT "adoption_followup_milestones_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "adoption_followup_milestones"
  ADD CONSTRAINT "adoption_followup_milestones_contract_id_fkey"
  FOREIGN KEY ("contract_id") REFERENCES "adoption_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "adoption_followup_milestones"
  ADD CONSTRAINT "adoption_followup_milestones_request_id_fkey"
  FOREIGN KEY ("request_id") REFERENCES "adoption_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "adoption_followup_evidence"
  ADD CONSTRAINT "adoption_followup_evidence_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "adoption_followup_evidence"
  ADD CONSTRAINT "adoption_followup_evidence_milestone_id_fkey"
  FOREIGN KEY ("milestone_id") REFERENCES "adoption_followup_milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ROW-LEVEL SECURITY (RNF03) — una organización solo ve/gestiona SU seguimiento.
-- ============================================================================
ALTER TABLE "adoption_followup_milestones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "adoption_followup_milestones" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "adoption_followup_milestones"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "adoption_followup_evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "adoption_followup_evidence" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "adoption_followup_evidence"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "adoption_followup_milestones" TO adoptafacil_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "adoption_followup_evidence" TO adoptafacil_app;

-- ============================================================================
-- ACCESO CROSS-TENANT CONTROLADO (M04) — el ADOPTANTE (Persona) responde el
-- seguimiento de un animal de OTRA organización. Su contexto de tenant es el suyo,
-- así que RLS no vería las filas. Estas funciones SECURITY DEFINER (misma técnica
-- que la firma de contrato) exponen SOLO los hitos cuyo `adopter_user_id` coincide
-- con el usuario. La autorización fina la reafirma la API antes de llamarlas.
-- ============================================================================

-- Un hito concreto del adoptante (read + guard de identidad).
CREATE OR REPLACE FUNCTION adoption_followup_for_adopter(p_milestone_id UUID, p_user_id UUID)
  RETURNS SETOF "adoption_followup_milestones"
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM "adoption_followup_milestones"
  WHERE "id" = p_milestone_id AND "adopter_user_id" = p_user_id;
$$;

-- Todos los hitos del adoptante (para su bandeja "mis seguimientos").
CREATE OR REPLACE FUNCTION adoption_followups_for_adopter_all(p_user_id UUID)
  RETURNS SETOF "adoption_followup_milestones"
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM "adoption_followup_milestones"
  WHERE "adopter_user_id" = p_user_id
  ORDER BY "due_at" ASC;
$$;

-- El adoptante responde: inserta evidencia y (opcional) completa el hito. Solo
-- actúa si el usuario es el adoptante y el hito está scheduled/overdue.
CREATE OR REPLACE FUNCTION adoption_followup_submit(
  p_milestone_id UUID,
  p_user_id UUID,
  p_kind TEXT,
  p_answers JSONB,
  p_storage_ref TEXT,
  p_storage_url TEXT,
  p_complete BOOLEAN
)
  RETURNS SETOF "adoption_followup_milestones"
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  m "adoption_followup_milestones";
BEGIN
  SELECT * INTO m FROM "adoption_followup_milestones"
    WHERE "id" = p_milestone_id
      AND "adopter_user_id" = p_user_id
      AND "status" IN ('scheduled', 'overdue');
  IF NOT FOUND THEN
    RETURN; -- 0 rows: not the adopter, or not answerable
  END IF;

  INSERT INTO "adoption_followup_evidence" (
    "id", "organization_id", "milestone_id", "kind", "answers",
    "storage_ref", "storage_url", "submitted_by_user_id"
  ) VALUES (
    gen_random_uuid(), m."organization_id", m."id", p_kind, p_answers,
    p_storage_ref, p_storage_url, p_user_id
  );

  IF p_complete THEN
    UPDATE "adoption_followup_milestones"
      SET "status" = 'completed', "completed_at" = CURRENT_TIMESTAMP, "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = m."id"
      RETURNING * INTO m;
  END IF;

  RETURN NEXT m;
END;
$$;

-- Worker: marca overdue los hitos vencidos sin completar y los devuelve para alertar.
CREATE OR REPLACE FUNCTION adoption_followups_mark_overdue()
  RETURNS SETOF "adoption_followup_milestones"
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
  UPDATE "adoption_followup_milestones"
    SET "status" = 'overdue', "updated_at" = CURRENT_TIMESTAMP
    WHERE "status" = 'scheduled' AND "due_at" < CURRENT_TIMESTAMP
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION adoption_followup_for_adopter(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION adoption_followups_for_adopter_all(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION adoption_followup_submit(UUID, UUID, TEXT, JSONB, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION adoption_followups_mark_overdue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION adoption_followup_for_adopter(UUID, UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION adoption_followups_for_adopter_all(UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION adoption_followup_submit(UUID, UUID, TEXT, JSONB, TEXT, TEXT, BOOLEAN) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION adoption_followups_mark_overdue() TO adoptafacil_app;

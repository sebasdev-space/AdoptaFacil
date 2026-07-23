-- CreateTable
CREATE TABLE "clinical_reminders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "clinical_event_id" UUID NOT NULL,
    "reminder_type" TEXT NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "channel" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "resolved_by_user_id" UUID,

    CONSTRAINT "clinical_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotency: a re-scan of the same event/dueDate/type is a no-op)
CREATE UNIQUE INDEX "clinical_reminders_idempotency_key" ON "clinical_reminders"("clinical_event_id", "due_date", "reminder_type");

-- CreateIndex
CREATE INDEX "clinical_reminders_organization_id_idx" ON "clinical_reminders"("organization_id");

-- CreateIndex
CREATE INDEX "clinical_reminders_organization_id_status_idx" ON "clinical_reminders"("organization_id", "status");

-- CreateIndex
CREATE INDEX "clinical_reminders_animal_id_idx" ON "clinical_reminders"("animal_id");

-- AddForeignKey (intra-module, modeled in Prisma)
ALTER TABLE "clinical_reminders" ADD CONSTRAINT "clinical_reminders_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey to organizations (declared in SQL, NOT as a Prisma @relation, to
-- avoid editing the Organization model in org.prisma — another owner's file).
-- clinical_event_id is the LOGICAL event id (clinical_events.event_id, non-unique
-- across versions) so it carries NO FK; resolved_by_user_id is a plain UUID with
-- no FK (mirrors audit_logs.actor_user_id — FK-checking RLS-FORCEd users is unsafe).
ALTER TABLE "clinical_reminders" ADD CONSTRAINT "clinical_reminders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- CLINICAL REMINDERS (M03, RF09) — tenant-isolated (RNF03). The background worker
-- writes rows via withTenant so INSERTs pass RLS even though the job runs outside
-- an HTTP request. NOT append-only: status is mutable (sent/failed/resolved), so
-- the app role keeps UPDATE but never DELETE. The reminder persists as the source
-- of truth even when the notification send fails.
-- ============================================================================

ALTER TABLE "clinical_reminders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clinical_reminders" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "clinical_reminders"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON "clinical_reminders" TO adoptafacil_app;
REVOKE DELETE, TRUNCATE ON "clinical_reminders" FROM adoptafacil_app;

-- ============================================================================
-- CROSS-TENANT DUE SCAN — the reminder worker runs OUTSIDE any HTTP request, so
-- it has NO tenant context and a normal app-role read of clinical_events would
-- return zero rows. Instead of evading RLS with a privileged SELECT, this bounded
-- SECURITY DEFINER function (runs as its owner) returns ONLY the columns the
-- worker needs — (organization_id, animal_id, clinical_event_id, due_date,
-- event_type) — for the CURRENT version (highest `version`) of each event whose
-- next_due_date falls within the window. The worker then creates each reminder
-- UNDER that org's tenant context (withTenant), so the INSERT passes RLS.
-- EXECUTE is granted only to the app role (never PUBLIC).
-- ============================================================================
CREATE OR REPLACE FUNCTION clinical_reminders_due(p_within_days INTEGER)
  RETURNS TABLE (
    organization_id UUID,
    animal_id UUID,
    clinical_event_id UUID,
    due_date TIMESTAMP,
    event_type TEXT
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT latest.organization_id, latest.animal_id, latest.event_id, latest.next_due_date, latest.type
  FROM (
    SELECT DISTINCT ON (event_id)
      event_id, organization_id, animal_id, next_due_date, type
    FROM clinical_events
    ORDER BY event_id, version DESC
  ) latest
  WHERE latest.next_due_date IS NOT NULL
    AND latest.next_due_date <= (now() + make_interval(days => p_within_days));
$$;

REVOKE ALL ON FUNCTION clinical_reminders_due(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clinical_reminders_due(INTEGER) TO adoptafacil_app;

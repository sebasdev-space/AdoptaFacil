-- CreateTable
CREATE TABLE "clinical_events" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "next_due_date" TIMESTAMP(3),
    "details" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL,
    "author_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_event_attachments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "clinical_event_id" UUID NOT NULL,
    "storage_ref" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_event_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clinical_events_organization_id_idx" ON "clinical_events"("organization_id");

-- CreateIndex
CREATE INDEX "clinical_events_animal_id_idx" ON "clinical_events"("animal_id");

-- CreateIndex
CREATE INDEX "clinical_events_event_id_idx" ON "clinical_events"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "clinical_events_event_id_version_key" ON "clinical_events"("event_id", "version");

-- CreateIndex
CREATE INDEX "clinical_event_attachments_organization_id_idx" ON "clinical_event_attachments"("organization_id");

-- CreateIndex
CREATE INDEX "clinical_event_attachments_clinical_event_id_idx" ON "clinical_event_attachments"("clinical_event_id");

-- AddForeignKey (intra-module, modeled in Prisma)
ALTER TABLE "clinical_events" ADD CONSTRAINT "clinical_events_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (intra-module, modeled in Prisma)
ALTER TABLE "clinical_event_attachments" ADD CONSTRAINT "clinical_event_attachments_clinical_event_id_fkey" FOREIGN KEY ("clinical_event_id") REFERENCES "clinical_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey to organizations (declared in SQL, NOT as a Prisma @relation, to
-- avoid editing the Organization model in org.prisma — another owner's file).
-- author_user_id is intentionally NOT a FK to users: FK-checking the RLS-FORCEd
-- users table from the non-superuser app role is unsafe (mirrors
-- audit_logs.actor_user_id). The author is preserved immutably in the row.
ALTER TABLE "clinical_events" ADD CONSTRAINT "clinical_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clinical_event_attachments" ADD CONSTRAINT "clinical_event_attachments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- CLINICAL RECORD (M03, RF08, RNF05, Ley 1774) — tenant-isolated (RNF03) AND
-- append-only/immutable. Each row is one VERSION of a clinical event; editing
-- INSERTs a new version sharing event_id. Earlier versions are kept forever with
-- their original author/timestamp. Prisma models none of the RLS/triggers, so it
-- is maintained by hand (mirrors the audit_logs / organization_documents pattern).
-- ============================================================================

-- 1. Tenant RLS (same canonical policy as every business table).
ALTER TABLE "clinical_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clinical_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "clinical_events"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "clinical_event_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clinical_event_attachments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "clinical_event_attachments"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- 2. Append-only: the app role may only read + insert (a new version / a new
--    attachment). It can NEVER update or delete — versions are immutable.
GRANT SELECT, INSERT ON "clinical_events" TO adoptafacil_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "clinical_events" FROM adoptafacil_app;
GRANT SELECT, INSERT ON "clinical_event_attachments" TO adoptafacil_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "clinical_event_attachments" FROM adoptafacil_app;

-- 3. DB-enforced immutability for EVERY role (incl. superuser, normal path):
--    reject any UPDATE/DELETE/TRUNCATE. Row/statement triggers fire regardless
--    of the caller, so a version cannot be altered or removed via the SQL path.
CREATE OR REPLACE FUNCTION clinical_events_reject_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'clinical_events is append-only: % is not permitted — edit creates a new version (RNF05)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER clinical_events_no_update
  BEFORE UPDATE ON "clinical_events"
  FOR EACH ROW EXECUTE FUNCTION clinical_events_reject_mutation();
CREATE TRIGGER clinical_events_no_delete
  BEFORE DELETE ON "clinical_events"
  FOR EACH ROW EXECUTE FUNCTION clinical_events_reject_mutation();
CREATE TRIGGER clinical_events_no_truncate
  BEFORE TRUNCATE ON "clinical_events"
  FOR EACH STATEMENT EXECUTE FUNCTION clinical_events_reject_mutation();

CREATE OR REPLACE FUNCTION clinical_event_attachments_reject_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'clinical_event_attachments is append-only: % is not permitted (RNF05)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER clinical_event_attachments_no_update
  BEFORE UPDATE ON "clinical_event_attachments"
  FOR EACH ROW EXECUTE FUNCTION clinical_event_attachments_reject_mutation();
CREATE TRIGGER clinical_event_attachments_no_delete
  BEFORE DELETE ON "clinical_event_attachments"
  FOR EACH ROW EXECUTE FUNCTION clinical_event_attachments_reject_mutation();
CREATE TRIGGER clinical_event_attachments_no_truncate
  BEFORE TRUNCATE ON "clinical_event_attachments"
  FOR EACH STATEMENT EXECUTE FUNCTION clinical_event_attachments_reject_mutation();

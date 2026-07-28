-- ============================================================================
-- M07 · Recurring sponsorships base (RF17 · T-056). Plans + subscription +
-- status + immutable history. NO payment is processed here (T-057 connects the
-- PaymentPort). Follows the same conventions as T-053/T-054/T-055 (campaigns):
-- FKs to organizations/animals declared in raw SQL (not Prisma @relation, to
-- keep sponsorships.prisma decoupled from org.prisma/animals.prisma), RLS
-- ENABLE+FORCE + tenant_isolation, and bounded SECURITY DEFINER functions for
-- the one legitimately cross-tenant operation (a Person subscribing to another
-- org's plan — mirrors M05 `create_donation`).
--
-- NOTE: only the sponsorships objects are declared here. The spurious
-- DROP CONSTRAINT / ALTER statements Prisma's differ emits for the SQL-declared
-- organization/animal FKs elsewhere (and platform_settings) are intentionally
-- omitted — those FKs are managed in raw SQL on purpose (established convention).
-- ============================================================================

-- CreateTable: sponsorship_plans
CREATE TABLE "sponsorship_plans" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "periodicity" TEXT NOT NULL DEFAULT 'monthly',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsorship_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable: sponsorships
CREATE TABLE "sponsorships" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "sponsor_user_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suspended_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsorships_pkey" PRIMARY KEY ("id")
);

-- CreateTable: sponsorship_status_history (append-only historial, RF17)
CREATE TABLE "sponsorship_status_history" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "sponsorship_id" UUID NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "actor_user_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sponsorship_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sponsorship_plans_organization_id_idx" ON "sponsorship_plans"("organization_id");
CREATE INDEX "sponsorship_plans_animal_id_idx" ON "sponsorship_plans"("animal_id");

CREATE INDEX "sponsorships_organization_id_idx" ON "sponsorships"("organization_id");
CREATE INDEX "sponsorships_plan_id_idx" ON "sponsorships"("plan_id");
CREATE INDEX "sponsorships_animal_id_idx" ON "sponsorships"("animal_id");
CREATE INDEX "sponsorships_sponsor_user_id_idx" ON "sponsorships"("sponsor_user_id");

CREATE INDEX "sponsorship_status_history_organization_id_idx" ON "sponsorship_status_history"("organization_id");
CREATE INDEX "sponsorship_status_history_sponsorship_id_idx" ON "sponsorship_status_history"("sponsorship_id");

-- AddForeignKey (intra-module, matches the Prisma @relation).
ALTER TABLE "sponsorships" ADD CONSTRAINT "sponsorships_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "sponsorship_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sponsorship_status_history" ADD CONSTRAINT "sponsorship_status_history_sponsorship_id_fkey" FOREIGN KEY ("sponsorship_id") REFERENCES "sponsorships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey to organizations (SQL, not a Prisma @relation — org.prisma is another owner's file).
ALTER TABLE "sponsorship_plans" ADD CONSTRAINT "sponsorship_plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sponsorships" ADD CONSTRAINT "sponsorships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sponsorship_status_history" ADD CONSTRAINT "sponsorship_status_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey to animals (SQL, not a Prisma @relation — animals.prisma stays
-- decoupled from sponsorships.prisma, same convention as T-104/T-105).
ALTER TABLE "sponsorship_plans" ADD CONSTRAINT "sponsorship_plans_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sponsorships" ADD CONSTRAINT "sponsorships_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ROW-LEVEL SECURITY (RNF03) — an org only ever reads/edits its OWN plans,
-- sponsorships and history. Mirrors the canonical tenant_isolation policy.
-- ============================================================================
ALTER TABLE "sponsorship_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sponsorship_plans" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sponsorship_plans"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "sponsorships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sponsorships" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sponsorships"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "sponsorship_status_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sponsorship_status_history" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sponsorship_status_history"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- Least privilege:
--  - plans: the org creates/edits its OWN plans directly (read+insert+update);
--    never DELETE — archived via is_active, not removed.
--  - sponsorships: the org SUSPENDS/REACTIVATES/CANCELS directly (read+update)
--    within its OWN tenant context; but CREATION is exclusively cross-tenant via
--    the SECURITY DEFINER function below (the app role gets no direct INSERT —
--    a Person is never a member of the beneficiary org, so a normal INSERT would
--    fail WITH CHECK anyway). Never DELETE.
--  - status history: append-only (read+insert only, like formalization_transitions);
--    the org's own suspend/reactivate/cancel action inserts its own entry within
--    its tenant context; the creation entry is inserted by the DEFINER function.
GRANT SELECT, INSERT, UPDATE ON "sponsorship_plans" TO adoptafacil_app;
REVOKE DELETE, TRUNCATE ON "sponsorship_plans" FROM adoptafacil_app;

GRANT SELECT, UPDATE ON "sponsorships" TO adoptafacil_app;
REVOKE INSERT, DELETE, TRUNCATE ON "sponsorships" FROM adoptafacil_app;

GRANT SELECT, INSERT ON "sponsorship_status_history" TO adoptafacil_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "sponsorship_status_history" FROM adoptafacil_app;

-- Immutability for EVERY role (incl. superuser, normal path): the historial is
-- append-only forever. Same rejection style as formalization_transitions/audit_logs.
CREATE OR REPLACE FUNCTION sponsorship_status_history_reject_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'sponsorship_status_history is append-only: % is not permitted (RF17)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER sponsorship_status_history_no_update
  BEFORE UPDATE ON "sponsorship_status_history"
  FOR EACH ROW EXECUTE FUNCTION sponsorship_status_history_reject_mutation();

CREATE TRIGGER sponsorship_status_history_no_delete
  BEFORE DELETE ON "sponsorship_status_history"
  FOR EACH ROW EXECUTE FUNCTION sponsorship_status_history_reject_mutation();

CREATE TRIGGER sponsorship_status_history_no_truncate
  BEFORE TRUNCATE ON "sponsorship_status_history"
  FOR EACH STATEMENT EXECUTE FUNCTION sponsorship_status_history_reject_mutation();

-- ============================================================================
-- CROSS-TENANT SUBSCRIPTION (M07) — a Person (padrino) subscribes to ANOTHER
-- org's plan; their tenant context is their own personal org, so a normal INSERT
-- would violate WITH CHECK. This SECURITY DEFINER function (same technique as
-- `create_donation`) validates the plan, creates the sponsorship AND its initial
-- history entry atomically, and returns SETOF (0 rows ⇒ "plan not found/archived",
-- no NULL row).
-- ============================================================================
CREATE OR REPLACE FUNCTION create_sponsorship(
  p_plan_id UUID,
  p_sponsor_user_id UUID
)
  RETURNS SETOF "sponsorships"
  LANGUAGE plpgsql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  s "sponsorships";
  v_org UUID;
  v_animal UUID;
  v_active BOOLEAN;
BEGIN
  SELECT organization_id, animal_id, is_active INTO v_org, v_animal, v_active
    FROM "sponsorship_plans" WHERE id = p_plan_id;
  IF NOT FOUND OR NOT v_active THEN
    RETURN; -- unknown or archived plan ⇒ no-op (app throws 404)
  END IF;

  INSERT INTO "sponsorships" (
    "id", "organization_id", "plan_id", "animal_id", "sponsor_user_id",
    "status", "started_at", "created_at", "updated_at"
  ) VALUES (
    gen_random_uuid(), v_org, p_plan_id, v_animal, p_sponsor_user_id,
    'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
  RETURNING * INTO s;

  INSERT INTO "sponsorship_status_history" (
    "id", "organization_id", "sponsorship_id", "from_status", "to_status", "actor_user_id", "created_at"
  ) VALUES (
    gen_random_uuid(), v_org, s.id, NULL, 'active', p_sponsor_user_id, CURRENT_TIMESTAMP
  );

  RETURN NEXT s;
END;
$$;

REVOKE ALL ON FUNCTION create_sponsorship(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_sponsorship(UUID, UUID) TO adoptafacil_app;

-- ============================================================================
-- PUBLIC PORTAL SUMMARY (optional, additive) — a public visitor has NO tenant
-- context; this SECURITY DEFINER function returns ONLY public columns: the
-- animal's active plans and how many ACTIVE sponsors it has (a count only —
-- NEVER sponsor identities/PII). EXECUTE is granted solely to the app role.
-- ============================================================================
CREATE OR REPLACE FUNCTION public_animal_sponsorship_summary(p_animal_id UUID)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'animalId', p_animal_id,
    'activePlans', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', sp.id,
            'animalId', sp.animal_id,
            'name', sp.name,
            'amount', sp.amount,
            'periodicity', sp.periodicity
          )
          ORDER BY sp.created_at ASC
        )
        FROM sponsorship_plans sp
        WHERE sp.animal_id = p_animal_id AND sp.is_active = true
      ),
      '[]'::jsonb
    ),
    'activeSponsorCount', (
      SELECT count(*) FROM sponsorships WHERE animal_id = p_animal_id AND status = 'active'
    )
  );
$$;

REVOKE ALL ON FUNCTION public_animal_sponsorship_summary(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_animal_sponsorship_summary(UUID) TO adoptafacil_app;

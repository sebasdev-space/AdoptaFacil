-- M07 · apadrinamientos: cobro recurrente vía links de pago de un solo uso
-- (S-5-REDISEÑO, incluye T-057). Reemplaza el diseño original de S-5 (débito
-- automático) — Wompi solo expone `createCollection` como un link de pago que
-- el padrino debe abrir y pagar manualmente cada período; no hay tokenización
-- de tarjeta. Este spec agrega el PRIMER cron real del proyecto (BullMQ
-- `repeat`, mismo patrón que T-106 clinical-reminders) para detectar
-- apadrinamientos vencidos y sostener una escalera TOLERANTE de recordatorios
-- + hasta 3 intentos de cobro antes de suspender.
--
-- Confirmación de pago por POLLING, no por webhook: el webhook único de Wompi
-- ya está cableado dentro de donations/** (dominio de Fabián) con un branch
-- hardcodeado para concept_kind='campaign' — extenderlo para 'sponsorship'
-- requeriría editar ese módulo, fuera del alcance de esta tarea (decisión
-- confirmada con el usuario, 24-ago). En su lugar, `sponsorship-payment-
-- poller.service.ts` llama `PaymentPort.getCollectionStatus()` directamente
-- para cada intento pendiente — sigue siendo "solo lectura/llamada" sobre
-- PaymentPort, sin tocar su código.

-- AlterTable: ancla de facturación PROPIA de cada apadrinamiento (nunca una
-- fecha fija compartida) — por defecto "ahora" al suscribirse, así el primer
-- período empieza de inmediato.
ALTER TABLE "sponsorships" ADD COLUMN "next_billing_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "sponsorship_payments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "sponsorship_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "period_started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "reminders_sent" INTEGER NOT NULL DEFAULT 0,
    "paid_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsorship_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsorship_payment_attempts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "sponsorship_payment_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "collection_id" TEXT NOT NULL,
    "payment_link_url" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "result" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sponsorship_payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sponsorship_payments_organization_id_idx" ON "sponsorship_payments"("organization_id");
CREATE INDEX "sponsorship_payments_sponsorship_id_idx" ON "sponsorship_payments"("sponsorship_id");
CREATE UNIQUE INDEX "sponsorship_payments_sponsorship_id_period_key" ON "sponsorship_payments"("sponsorship_id", "period");

CREATE UNIQUE INDEX "sponsorship_payment_attempts_idempotency_key_key" ON "sponsorship_payment_attempts"("idempotency_key");
CREATE INDEX "sponsorship_payment_attempts_organization_id_idx" ON "sponsorship_payment_attempts"("organization_id");
CREATE INDEX "sponsorship_payment_attempts_collection_id_idx" ON "sponsorship_payment_attempts"("collection_id");
CREATE UNIQUE INDEX "sponsorship_payment_attempts_payment_attempt_key" ON "sponsorship_payment_attempts"("sponsorship_payment_id", "attempt_number");

-- AddForeignKey
ALTER TABLE "sponsorship_payments" ADD CONSTRAINT "sponsorship_payments_sponsorship_id_fkey"
  FOREIGN KEY ("sponsorship_id") REFERENCES "sponsorships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sponsorship_payments" ADD CONSTRAINT "sponsorship_payments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sponsorship_payment_attempts" ADD CONSTRAINT "sponsorship_payment_attempts_sponsorship_payment_id_fkey"
  FOREIGN KEY ("sponsorship_payment_id") REFERENCES "sponsorship_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sponsorship_payment_attempts" ADD CONSTRAINT "sponsorship_payment_attempts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (S-5-REDISEÑO)
ALTER TABLE "sponsorship_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sponsorship_payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sponsorship_payments"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON "sponsorship_payments" TO adoptafacil_app;
REVOKE DELETE, TRUNCATE ON "sponsorship_payments" FROM adoptafacil_app;

ALTER TABLE "sponsorship_payment_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sponsorship_payment_attempts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "sponsorship_payment_attempts"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON "sponsorship_payment_attempts" TO adoptafacil_app;
REVOKE DELETE, TRUNCATE ON "sponsorship_payment_attempts" FROM adoptafacil_app;

-- Both tables are mutated through NORMAL RLS-scoped Prisma calls (withOrgContext),
-- not SECURITY DEFINER functions — every mutation the billing job performs
-- happens ONE sponsorship (one org) at a time, after a cross-tenant DISCOVERY
-- read (the 3 functions below). So the app role keeps UPDATE, unlike the
-- fully-locked-down append-only tables elsewhere in this project (reviews,
-- volunteer_certificates) — but content besides the status/counter columns is
-- still immutable, and status only moves forward, enforced by triggers below.

CREATE OR REPLACE FUNCTION sponsorship_payments_reject_content_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.sponsorship_id IS DISTINCT FROM OLD.sponsorship_id
     OR NEW.period IS DISTINCT FROM OLD.period
     OR NEW.period_started_at IS DISTINCT FROM OLD.period_started_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION
      'sponsorship_payments: identity/period columns are immutable (S-5-REDISEÑO)'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- `failed -> paid` is a DELIBERATE second allowed edge (Objetivo 6): a
-- sponsor who was auto-suspended for billing failure may generate and pay a
-- NEW link on their own initiative ("recuperación") — the historical failed
-- period is retroactively marked paid rather than opening a fresh period,
-- since it already carries the (organizationId, sponsorshipId, period)
-- unique key for that same billing cycle.
CREATE OR REPLACE FUNCTION sponsorship_payments_validate_transition() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF NOT (
    (OLD.status = 'pending' AND NEW.status IN ('paid', 'failed')) OR
    (OLD.status = 'failed' AND NEW.status = 'paid')
  ) THEN
    RAISE EXCEPTION
      'sponsorship_payments: invalid status transition % -> % (S-5-REDISEÑO)', OLD.status, NEW.status
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sponsorship_payments_reject_removal() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'sponsorship_payments keeps the full billing ledger: % is not permitted (S-5-REDISEÑO)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER sponsorship_payments_no_content_mutation
  BEFORE UPDATE ON "sponsorship_payments"
  FOR EACH ROW EXECUTE FUNCTION sponsorship_payments_reject_content_mutation();
CREATE TRIGGER sponsorship_payments_validate_status_transition
  BEFORE UPDATE ON "sponsorship_payments"
  FOR EACH ROW EXECUTE FUNCTION sponsorship_payments_validate_transition();
CREATE TRIGGER sponsorship_payments_no_delete
  BEFORE DELETE ON "sponsorship_payments"
  FOR EACH ROW EXECUTE FUNCTION sponsorship_payments_reject_removal();
CREATE TRIGGER sponsorship_payments_no_truncate
  BEFORE TRUNCATE ON "sponsorship_payments"
  FOR EACH STATEMENT EXECUTE FUNCTION sponsorship_payments_reject_removal();

CREATE OR REPLACE FUNCTION sponsorship_payment_attempts_reject_content_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.sponsorship_payment_id IS DISTINCT FROM OLD.sponsorship_payment_id
     OR NEW.attempt_number IS DISTINCT FROM OLD.attempt_number
     OR NEW.collection_id IS DISTINCT FROM OLD.collection_id
     OR NEW.payment_link_url IS DISTINCT FROM OLD.payment_link_url
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION
      'sponsorship_payment_attempts: content is immutable after creation (S-5-REDISEÑO)'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sponsorship_payment_attempts_validate_transition() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.result = OLD.result THEN
    RETURN NEW;
  END IF;
  IF NOT (OLD.result = 'pending' AND NEW.result IN ('paid', 'expired')) THEN
    RAISE EXCEPTION
      'sponsorship_payment_attempts: invalid result transition % -> % (S-5-REDISEÑO)', OLD.result, NEW.result
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sponsorship_payment_attempts_reject_removal() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'sponsorship_payment_attempts keeps the full attempt ledger: % is not permitted (S-5-REDISEÑO)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER sponsorship_payment_attempts_no_content_mutation
  BEFORE UPDATE ON "sponsorship_payment_attempts"
  FOR EACH ROW EXECUTE FUNCTION sponsorship_payment_attempts_reject_content_mutation();
CREATE TRIGGER sponsorship_payment_attempts_validate_status_transition
  BEFORE UPDATE ON "sponsorship_payment_attempts"
  FOR EACH ROW EXECUTE FUNCTION sponsorship_payment_attempts_validate_transition();
CREATE TRIGGER sponsorship_payment_attempts_no_delete
  BEFORE DELETE ON "sponsorship_payment_attempts"
  FOR EACH ROW EXECUTE FUNCTION sponsorship_payment_attempts_reject_removal();
CREATE TRIGGER sponsorship_payment_attempts_no_truncate
  BEFORE TRUNCATE ON "sponsorship_payment_attempts"
  FOR EACH STATEMENT EXECUTE FUNCTION sponsorship_payment_attempts_reject_removal();

-- ============================================================================
-- CROSS-TENANT DISCOVERY (SECURITY DEFINER, read-only) — the daily job and the
-- payment poller run with NO tenant context (background worker), so finding
-- "what's due across ALL organizations" needs the same bounded-function
-- technique as `clinical_reminders_due()` (T-106). Every MUTATION that follows
-- a discovery read happens under `withOrgContext(organizationId, ...)` for
-- that specific row's own org — normal RLS-scoped Prisma writes, no privilege
-- escalation beyond the read itself.
-- ============================================================================

-- Active sponsorships whose billing anchor has arrived.
CREATE OR REPLACE FUNCTION sponsorships_due_for_billing()
  RETURNS TABLE(
    sponsorship_id UUID,
    organization_id UUID,
    organization_name TEXT,
    animal_name TEXT,
    plan_amount INTEGER,
    sponsor_user_id UUID,
    sponsor_email TEXT
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT s.id, s.organization_id, o.name, a.name, pl.amount, s.sponsor_user_id, u.email
  FROM "sponsorships" s
  JOIN "sponsorship_plans" pl ON pl.id = s.plan_id
  JOIN "organizations" o ON o.id = s.organization_id
  JOIN "animals" a ON a.id = s.animal_id
  JOIN "users" u ON u.id = s.sponsor_user_id
  WHERE s.status = 'active' AND s.next_billing_at <= CURRENT_TIMESTAMP;
$$;

REVOKE ALL ON FUNCTION sponsorships_due_for_billing() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sponsorships_due_for_billing() TO adoptafacil_app;

-- Open (still `pending`) billing periods, across all organizations — the
-- ladder job walks each one forward per `reminders_sent`/`attempt_count` vs.
-- elapsed days since `period_started_at`.
CREATE OR REPLACE FUNCTION sponsorship_open_payment_periods()
  RETURNS TABLE(
    payment_id UUID,
    organization_id UUID,
    organization_name TEXT,
    animal_name TEXT,
    sponsorship_id UUID,
    period TEXT,
    period_started_at TIMESTAMP,
    attempt_count INTEGER,
    reminders_sent INTEGER,
    plan_amount INTEGER,
    sponsor_user_id UUID,
    sponsor_email TEXT
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT sp.id, sp.organization_id, o.name, a.name, sp.sponsorship_id, sp.period, sp.period_started_at,
         sp.attempt_count, sp.reminders_sent, pl.amount, s.sponsor_user_id, u.email
  FROM "sponsorship_payments" sp
  JOIN "sponsorships" s ON s.id = sp.sponsorship_id
  JOIN "sponsorship_plans" pl ON pl.id = s.plan_id
  JOIN "organizations" o ON o.id = sp.organization_id
  JOIN "animals" a ON a.id = s.animal_id
  JOIN "users" u ON u.id = s.sponsor_user_id
  WHERE sp.status = 'pending';
$$;

REVOKE ALL ON FUNCTION sponsorship_open_payment_periods() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sponsorship_open_payment_periods() TO adoptafacil_app;

-- Attempts still awaiting confirmation, across all organizations — polled
-- against `PaymentPort.getCollectionStatus()` (no webhook wiring, see the
-- header comment).
CREATE OR REPLACE FUNCTION sponsorship_pending_payment_attempts()
  RETURNS TABLE(
    attempt_id UUID,
    organization_id UUID,
    sponsorship_payment_id UUID,
    collection_id TEXT
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT id, organization_id, sponsorship_payment_id, collection_id
  FROM "sponsorship_payment_attempts"
  WHERE result = 'pending';
$$;

REVOKE ALL ON FUNCTION sponsorship_pending_payment_attempts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sponsorship_pending_payment_attempts() TO adoptafacil_app;

-- Sponsor-initiated recovery (Objetivo 6): the calling sponsor is not a
-- member of the sponsored org, so validating "is this MY suspended
-- sponsorship, with a failed period to retry" needs the same cross-tenant
-- technique as `create_sponsorship`. Returns nothing if the caller is not
-- the sponsor, the sponsorship is not suspended, or it has no failed period
-- — the app maps an empty result to 404/400 as appropriate. Whether the
-- suspension was actually billing-related (vs. manual by the org) is
-- checked separately in TypeScript against `BILLING_FAILURE_SUSPENSION_REASON`
-- (kept in ONE place, the contracts package, not duplicated into SQL).
CREATE OR REPLACE FUNCTION sponsorship_billing_recovery_context(
  p_sponsorship_id UUID,
  p_sponsor_user_id UUID
)
  RETURNS TABLE(
    organization_id UUID,
    plan_amount INTEGER,
    failed_payment_id UUID,
    period TEXT,
    attempt_count INTEGER
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT s.organization_id, pl.amount, sp.id, sp.period, sp.attempt_count
  FROM "sponsorships" s
  JOIN "sponsorship_plans" pl ON pl.id = s.plan_id
  JOIN "sponsorship_payments" sp ON sp.sponsorship_id = s.id AND sp.status = 'failed'
  WHERE s.id = p_sponsorship_id
    AND s.sponsor_user_id = p_sponsor_user_id
    AND s.status = 'suspended'
  ORDER BY sp.created_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION sponsorship_billing_recovery_context(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sponsorship_billing_recovery_context(UUID, UUID) TO adoptafacil_app;

-- Additive amendment of `sponsorships_for_sponsor()` (T-056/S2-03): adds
-- `currentPeriodStatus`/`currentPeriodAttemptCount` from the latest
-- SponsorshipPayment (if any) so "Mis apadrinamientos" can show "pago
-- pendiente / en riesgo" (Objetivo 7) without a second round-trip. Every
-- pre-existing field is untouched (contracts aditivos).
CREATE OR REPLACE FUNCTION sponsorships_for_sponsor(p_user_id UUID)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'organizationId', s.organization_id,
        'planId', s.plan_id,
        'planName', p.name,
        'planAmount', p.amount,
        'planPeriodicity', p.periodicity,
        'animalId', s.animal_id,
        'animalName', a.name,
        'sponsorUserId', s.sponsor_user_id,
        'status', s.status,
        'startedAt', s.started_at,
        'suspendedAt', s.suspended_at,
        'cancelledAt', s.cancelled_at,
        'currentPeriodStatus', latest_payment.status,
        'currentPeriodAttemptCount', latest_payment.attempt_count,
        'createdAt', s.created_at
      )
      ORDER BY s.created_at DESC
    ),
    '[]'::jsonb
  )
  FROM "sponsorships" s
  JOIN "sponsorship_plans" p ON p.id = s.plan_id
  JOIN "animals" a ON a.id = s.animal_id
  LEFT JOIN LATERAL (
    SELECT sp.status, sp.attempt_count
    FROM "sponsorship_payments" sp
    WHERE sp.sponsorship_id = s.id
    ORDER BY sp.created_at DESC
    LIMIT 1
  ) latest_payment ON true
  WHERE s.sponsor_user_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION sponsorships_for_sponsor(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sponsorships_for_sponsor(UUID) TO adoptafacil_app;

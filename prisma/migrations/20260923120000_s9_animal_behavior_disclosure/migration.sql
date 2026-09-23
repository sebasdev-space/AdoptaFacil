-- CreateTable
CREATE TABLE "animal_behavior_disclosures" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "declared_by_user_id" UUID NOT NULL,
    "signed_by_name" TEXT NOT NULL,
    "reactivity_notes" TEXT,
    "bite_history" BOOLEAN NOT NULL DEFAULT false,
    "bite_history_detail" TEXT,
    "children_compatibility" TEXT NOT NULL,
    "medical_conditions_relevant" TEXT,
    "signature_hash" TEXT NOT NULL,
    "declared_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "animal_behavior_disclosures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "animal_behavior_disclosures_organization_id_idx" ON "animal_behavior_disclosures"("organization_id");

-- CreateIndex
CREATE INDEX "animal_behavior_disclosures_animal_id_idx" ON "animal_behavior_disclosures"("animal_id");

-- CreateIndex
CREATE INDEX "animal_behavior_disclosures_animal_id_declared_at_idx" ON "animal_behavior_disclosures"("animal_id", "declared_at");

-- AddForeignKey
ALTER TABLE "animal_behavior_disclosures" ADD CONSTRAINT "animal_behavior_disclosures_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ANIMAL BEHAVIOR DISCLOSURES (M03, S-9, FSD v3.5 Doc 4 · Art. 2353 inciso 2
-- C.C. "Safe Harbor" del refugio) — tenant-isolated AND fully append-only,
-- exactly like legal_representatives: each row is the immutable record of one
-- declaration/re-declaration, kept forever; "vigente" is computed at read time
-- (MAX(declared_at) per animal_id), never a stored flag flipped on the old row.
-- Signing happens atomically at creation (the FSD's modal declares AND signs
-- in one step) — there is no follow-up mutation to allow for, so this is
-- simpler than sponsorship_payments' partial-mutability pattern.
-- ============================================================================

-- 1. Tenant RLS (same canonical policy as every other business table).
ALTER TABLE "animal_behavior_disclosures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "animal_behavior_disclosures" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "animal_behavior_disclosures"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- 2. Append-only: the app role may only read + insert.
GRANT SELECT, INSERT ON "animal_behavior_disclosures" TO adoptafacil_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "animal_behavior_disclosures" FROM adoptafacil_app;

-- 3. Immutability for EVERY role (incl. superuser): reject any UPDATE/DELETE/
--    TRUNCATE. Reuses the same rejection style as legal_representatives.
CREATE OR REPLACE FUNCTION animal_behavior_disclosures_reject_mutation() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'animal_behavior_disclosures is append-only: % is not permitted (FSD v3.5 Doc 4)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER animal_behavior_disclosures_no_update
  BEFORE UPDATE ON "animal_behavior_disclosures"
  FOR EACH ROW EXECUTE FUNCTION animal_behavior_disclosures_reject_mutation();

CREATE TRIGGER animal_behavior_disclosures_no_delete
  BEFORE DELETE ON "animal_behavior_disclosures"
  FOR EACH ROW EXECUTE FUNCTION animal_behavior_disclosures_reject_mutation();

CREATE TRIGGER animal_behavior_disclosures_no_truncate
  BEFORE TRUNCATE ON "animal_behavior_disclosures"
  FOR EACH STATEMENT EXECUTE FUNCTION animal_behavior_disclosures_reject_mutation();

-- ============================================================================
-- CROSS-MODULE NARROW READ for M04 (Fabián) — same pattern as
-- legal_representative_summary: a SECURITY DEFINER function is the ONLY path
-- across the module boundary. His Placement engine must find a CURRENT row
-- here before generating a comodato contract for SALIDA_TEMPORAL/HOGAR_DE_PASO
-- (FSD checklist QA #2) and embeds these fields as the signed annex (FSD
-- Sección C.4). Runs with no tenant/JWT context assumption — callable directly
-- from his backend code (not exposed as a public HTTP route), same as the
-- legal representative summary function.
-- ============================================================================
CREATE OR REPLACE FUNCTION animal_behavior_disclosure_current(p_animal_id UUID)
  RETURNS TABLE(
    id UUID,
    organization_id UUID,
    signed_by_name TEXT,
    reactivity_notes TEXT,
    bite_history BOOLEAN,
    bite_history_detail TEXT,
    children_compatibility TEXT,
    medical_conditions_relevant TEXT,
    signature_hash TEXT,
    declared_at TIMESTAMP
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT id, organization_id, signed_by_name, reactivity_notes, bite_history,
         bite_history_detail, children_compatibility, medical_conditions_relevant,
         signature_hash, declared_at
  FROM animal_behavior_disclosures
  WHERE animal_id = p_animal_id
  ORDER BY declared_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION animal_behavior_disclosure_current(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION animal_behavior_disclosure_current(UUID) TO adoptafacil_app;

-- T-028a · M04 adoption requests (solicitud + evaluación).
--
-- NOTE: Prisma's diff also proposed dropping FKs on animals/portal_themes/etc.
-- Those FKs are added BY HAND in raw SQL migrations (not modeled in Prisma), so
-- the diff wrongly sees them as drift. Dropping them would break referential
-- integrity AND touch @sebastian's M03 tables (out of bounds). They are removed
-- from this migration on purpose — this migration ONLY adds M04's own objects.

-- CreateTable
CREATE TABLE "adoption_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "animal_snapshot" JSONB NOT NULL,
    "applicant_user_id" UUID NOT NULL,
    "applicant" JSONB NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "contract_ref" TEXT,
    "tracking_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adoption_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "adoption_requests_organization_id_idx" ON "adoption_requests"("organization_id");
CREATE INDEX "adoption_requests_animal_id_idx" ON "adoption_requests"("animal_id");
CREATE INDEX "adoption_requests_applicant_user_id_idx" ON "adoption_requests"("applicant_user_id");

-- RF10 · UNICIDAD: una solicitud ACTIVA (new/in_review) por (animal, usuario).
-- Índice único PARCIAL — Prisma no lo modela, se declara aquí a mano. Una solicitud
-- rechazada/aprobada no bloquea volver a postular más adelante.
CREATE UNIQUE INDEX "adoption_requests_active_uq"
  ON "adoption_requests"("animal_id", "applicant_user_id")
  WHERE "status" IN ('new', 'in_review');

-- AddForeignKey (frontera M04→M01): la relación con Organization no vive en el
-- modelo Prisma (org.prisma es de @sebastian); la FK + cascade se añade a mano.
ALTER TABLE "adoption_requests"
  ADD CONSTRAINT "adoption_requests_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ROW-LEVEL SECURITY (RNF03) — una organización solo ve/gestiona SUS solicitudes
-- (las de los animales que le pertenecen). Patrón canónico _rls_probe.
-- ============================================================================
ALTER TABLE "adoption_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "adoption_requests" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON "adoption_requests"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "adoption_requests" TO adoptafacil_app;

-- ============================================================================
-- CREACIÓN CROSS-TENANT CONTROLADA (M04) — un adoptante (persona) postula sobre
-- un animal de OTRA organización; su contexto de tenant es el suyo, así que un
-- INSERT normal del rol de app violaría la política WITH CHECK. En vez de evadir
-- la RLS con un rol privilegiado, esta función SECURITY DEFINER (misma técnica que
-- `organization_public`) inserta UNA solicitud en el tenant de la org destino.
-- El conflicto de interés (miembro de la propia org) y la longitud del mensaje se
-- validan en la API ANTES de llamarla; la UNICIDAD la impone el índice parcial.
-- ============================================================================
CREATE OR REPLACE FUNCTION create_adoption_request(
  p_organization_id UUID,
  p_animal_id UUID,
  p_animal_snapshot JSONB,
  p_applicant_user_id UUID,
  p_applicant JSONB,
  p_message TEXT
)
  RETURNS "adoption_requests"
  LANGUAGE sql
  VOLATILE
  SECURITY DEFINER
  SET search_path = public
AS $$
  INSERT INTO "adoption_requests" (
    "id", "organization_id", "animal_id", "animal_snapshot",
    "applicant_user_id", "applicant", "message", "status", "updated_at"
  )
  VALUES (
    gen_random_uuid(), p_organization_id, p_animal_id, p_animal_snapshot,
    p_applicant_user_id, p_applicant, p_message, 'new', CURRENT_TIMESTAMP
  )
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION create_adoption_request(UUID, UUID, JSONB, UUID, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_adoption_request(UUID, UUID, JSONB, UUID, JSONB, TEXT) TO adoptafacil_app;

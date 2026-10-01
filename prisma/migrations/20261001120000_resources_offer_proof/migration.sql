-- M09 (Banco de recursos): prueba (foto/factura) del donante al OFRECER y
-- validación EXPLÍCITA por la organización (aprobar/rechazar con motivo),
-- distinta de completar la entrega. Escrita a mano (no se corre
-- `migrate dev` contra la BD compartida).

-- AlterTable: estado de validación de la prueba (null = sin prueba adjunta)
ALTER TABLE "resource_offers"
  ADD COLUMN "proof_status" TEXT,
  ADD COLUMN "proof_validated_by_user_id" UUID,
  ADD COLUMN "proof_validated_at" TIMESTAMP(3),
  ADD COLUMN "proof_validation_reason" TEXT;

ALTER TABLE "resource_offers"
  ADD CONSTRAINT "resource_offers_proof_status_check"
  CHECK ("proof_status" IS NULL OR "proof_status" IN ('pending', 'approved', 'rejected'));

-- CreateTable
CREATE TABLE "resource_offer_proofs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_ref" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_offer_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resource_offer_proofs_organization_id_idx" ON "resource_offer_proofs"("organization_id");
CREATE INDEX "resource_offer_proofs_offer_id_idx" ON "resource_offer_proofs"("offer_id");

-- AddForeignKey (intra-módulo) y frontera M09→M01 (a mano)
ALTER TABLE "resource_offer_proofs" ADD CONSTRAINT "resource_offer_proofs_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "resource_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource_offer_proofs" ADD CONSTRAINT "resource_offer_proofs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ROW-LEVEL SECURITY (RNF03)
ALTER TABLE "resource_offer_proofs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "resource_offer_proofs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "resource_offer_proofs"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- Append-only para el rol de la app: la organización solo lee; el donante
-- inserta vía add_resource_offer_proof (SECURITY DEFINER).
GRANT SELECT, INSERT ON "resource_offer_proofs" TO adoptafacil_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "resource_offer_proofs" FROM adoptafacil_app;

-- ============================================================================
-- Funciones cross-tenant acotadas (el donante no es miembro de la org
-- beneficiaria, mismo patrón que create_resource_offer).
-- ============================================================================

-- Contexto mínimo para reservar la clave de storage: SOLO si la oferta es del
-- donante. 0 filas => no existe o no es suya.
CREATE OR REPLACE FUNCTION resource_offer_proof_context(p_offer_id UUID, p_donor_user_id UUID)
  RETURNS TABLE (organization_id UUID, status TEXT, proof_status TEXT, proof_count INTEGER)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT off."organization_id", off."status", off."proof_status",
         (SELECT count(*)::int FROM "resource_offer_proofs" p WHERE p."offer_id" = off."id")
    FROM "resource_offers" off
    WHERE off."id" = p_offer_id AND off."donor_user_id" = p_donor_user_id;
$$;

-- Adjunta una prueba a LA PROPIA oferta del donante (solo mientras la oferta
-- esta 'offered'/'accepted', la prueba no este ya aprobada y no se exceda el
-- maximo) y deja la validacion en 'pending' (limpiando una decision previa).
CREATE OR REPLACE FUNCTION add_resource_offer_proof(
  p_offer_id UUID,
  p_donor_user_id UUID,
  p_storage_ref TEXT,
  p_filename TEXT,
  p_content_type TEXT,
  p_size_bytes INTEGER,
  p_max_proofs INTEGER
)
  RETURNS SETOF "resource_offer_proofs"
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_offer "resource_offers"; pr "resource_offer_proofs";
BEGIN
  SELECT * INTO v_offer FROM "resource_offers"
    WHERE "id" = p_offer_id AND "donor_user_id" = p_donor_user_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF v_offer."status" NOT IN ('offered', 'accepted') OR v_offer."proof_status" = 'approved' THEN
    RETURN;
  END IF;
  IF (SELECT count(*) FROM "resource_offer_proofs" WHERE "offer_id" = p_offer_id) >= p_max_proofs THEN
    RETURN;
  END IF;

  INSERT INTO "resource_offer_proofs" (
    "id", "organization_id", "offer_id", "uploaded_by_user_id", "filename", "content_type", "size_bytes", "storage_ref"
  ) VALUES (
    gen_random_uuid(), v_offer."organization_id", p_offer_id, p_donor_user_id, p_filename, p_content_type, p_size_bytes, p_storage_ref
  )
  RETURNING * INTO pr;

  UPDATE "resource_offers"
    SET "proof_status" = 'pending',
        "proof_validated_by_user_id" = NULL,
        "proof_validated_at" = NULL,
        "proof_validation_reason" = NULL,
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = p_offer_id;
  RETURN NEXT pr;
END;
$$;

-- "Mis ofertas" del donante, ahora con el estado de validacion de la prueba
-- (misma firma/retorno JSONB; solo agrega claves).
CREATE OR REPLACE FUNCTION resource_offers_for_donor(p_user_id UUID)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(item ORDER BY (item->>'createdAt') DESC), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'id', off.id,
      'organizationId', off.organization_id,
      'organizationName', o.name,
      'needId', off.need_id,
      'needTitle', n.title,
      'needUnit', n.unit,
      'donorUserId', off.donor_user_id,
      'quantityOffered', off.quantity_offered,
      'message', off.message,
      'status', off.status,
      'createdAt', to_char(off.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'updatedAt', to_char(off.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'deliveryStatus', d.status,
      'deliveryScheduledAt', to_char(d.scheduled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'deliveryCompletedAt', to_char(d.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'proofStatus', off.proof_status,
      'proofValidatedAt', to_char(off.proof_validated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'proofValidationReason', off.proof_validation_reason,
      'proofCount', (SELECT count(*) FROM "resource_offer_proofs" p WHERE p.offer_id = off.id)
    ) AS item
    FROM "resource_offers" off
    JOIN "resource_needs" n ON n.id = off.need_id
    JOIN "organizations" o ON o.id = off.organization_id
    LEFT JOIN "resource_deliveries" d ON d.offer_id = off.id
    WHERE off.donor_user_id = p_user_id
  ) rows;
$$;

REVOKE ALL ON FUNCTION resource_offer_proof_context(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION add_resource_offer_proof(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resource_offer_proof_context(UUID, UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION add_resource_offer_proof(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO adoptafacil_app;

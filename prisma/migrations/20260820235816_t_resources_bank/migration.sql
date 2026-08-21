-- F-6 (M09, Ola 3): banco de recursos — necesidades, ofertas de donación
-- física y entregas con evidencia.
--
-- NOTE (mismo patrón que otras migraciones recientes): el diff de Prisma
-- propuso además DROP de ~24 foreign keys añadidas a mano en migraciones
-- anteriores y un ALTER de platform_settings.updated_at sin relación con
-- esta tarea. Ninguno de los dos va aquí: esta migración SOLO agrega las
-- tablas de M09.

-- CreateTable
CREATE TABLE "resource_needs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "quantity_needed" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity_fulfilled" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'needed',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resource_needs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_offers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "need_id" UUID NOT NULL,
    "donor_user_id" UUID NOT NULL,
    "quantity_offered" INTEGER NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'offered',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resource_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_deliveries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "need_id" UUID NOT NULL,
    "method" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resource_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_delivery_evidences" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "caption" TEXT,
    "storage_ref" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resource_delivery_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_fulfillment_applications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "need_id" UUID NOT NULL,
    "quantity_applied" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_fulfillment_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resource_needs_organization_id_idx" ON "resource_needs"("organization_id");
CREATE INDEX "resource_needs_organization_id_status_idx" ON "resource_needs"("organization_id", "status");
CREATE INDEX "resource_offers_organization_id_idx" ON "resource_offers"("organization_id");
CREATE INDEX "resource_offers_need_id_idx" ON "resource_offers"("need_id");
CREATE INDEX "resource_offers_donor_user_id_idx" ON "resource_offers"("donor_user_id");
CREATE UNIQUE INDEX "resource_deliveries_offer_id_key" ON "resource_deliveries"("offer_id");
CREATE INDEX "resource_deliveries_organization_id_idx" ON "resource_deliveries"("organization_id");
CREATE INDEX "resource_deliveries_need_id_idx" ON "resource_deliveries"("need_id");
CREATE INDEX "resource_delivery_evidences_organization_id_idx" ON "resource_delivery_evidences"("organization_id");
CREATE INDEX "resource_delivery_evidences_delivery_id_idx" ON "resource_delivery_evidences"("delivery_id");
CREATE UNIQUE INDEX "resource_fulfillment_applications_delivery_id_key" ON "resource_fulfillment_applications"("delivery_id");
CREATE INDEX "resource_fulfillment_applications_organization_id_idx" ON "resource_fulfillment_applications"("organization_id");

-- AddForeignKey (intra-módulo — modeladas en Prisma)
ALTER TABLE "resource_offers" ADD CONSTRAINT "resource_offers_need_id_fkey" FOREIGN KEY ("need_id") REFERENCES "resource_needs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource_deliveries" ADD CONSTRAINT "resource_deliveries_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "resource_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource_delivery_evidences" ADD CONSTRAINT "resource_delivery_evidences_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "resource_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource_fulfillment_applications" ADD CONSTRAINT "resource_fulfillment_applications_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "resource_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (frontera M09→M01): FK a organizations a mano en las 5 tablas
-- (org.prisma es de @sebastian; la relación no vive en el modelo Prisma).
ALTER TABLE "resource_needs" ADD CONSTRAINT "resource_needs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource_offers" ADD CONSTRAINT "resource_offers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource_deliveries" ADD CONSTRAINT "resource_deliveries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource_delivery_evidences" ADD CONSTRAINT "resource_delivery_evidences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource_fulfillment_applications" ADD CONSTRAINT "resource_fulfillment_applications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ROW-LEVEL SECURITY (RNF03) — una organización solo ve/gestiona SUS
-- necesidades/ofertas/entregas/evidencias. Patrón canónico _rls_probe.
-- ============================================================================
ALTER TABLE "resource_needs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "resource_needs" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "resource_needs"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "resource_offers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "resource_offers" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "resource_offers"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "resource_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "resource_deliveries" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "resource_deliveries"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "resource_delivery_evidences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "resource_delivery_evidences" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "resource_delivery_evidences"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "resource_fulfillment_applications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "resource_fulfillment_applications" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "resource_fulfillment_applications"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- Least privilege: ninguna tabla admite DELETE desde el rol de la app (el
-- ciclo de vida es por `status`/`deletedAt` lógico, nunca borrado físico).
GRANT SELECT, INSERT, UPDATE ON "resource_needs" TO adoptafacil_app;
REVOKE DELETE, TRUNCATE ON "resource_needs" FROM adoptafacil_app;
GRANT SELECT, INSERT, UPDATE ON "resource_offers" TO adoptafacil_app;
REVOKE DELETE, TRUNCATE ON "resource_offers" FROM adoptafacil_app;
GRANT SELECT, INSERT, UPDATE ON "resource_deliveries" TO adoptafacil_app;
REVOKE DELETE, TRUNCATE ON "resource_deliveries" FROM adoptafacil_app;
GRANT SELECT, INSERT, UPDATE ON "resource_delivery_evidences" TO adoptafacil_app;
REVOKE DELETE, TRUNCATE ON "resource_delivery_evidences" FROM adoptafacil_app;
-- Ledger append-only (mismo patrón que campaign_funding_applications): la app
-- solo lee; el INSERT ocurre en la MISMA transacción autenticada que completa
-- la entrega (no necesita SECURITY DEFINER — a diferencia del webhook de
-- donaciones, aquí SIEMPRE hay contexto de tenant real).
GRANT SELECT, INSERT ON "resource_fulfillment_applications" TO adoptafacil_app;
REVOKE UPDATE, DELETE, TRUNCATE ON "resource_fulfillment_applications" FROM adoptafacil_app;

-- ============================================================================
-- Oferta cross-tenant (M09) — un donante (Persona u organización) ofrece
-- cubrir una necesidad de OTRA organización; su contexto de tenant es el
-- suyo, así que un INSERT normal violaría WITH CHECK. Misma técnica que
-- `create_donation`: SECURITY DEFINER, sin idempotencyKey (no hay reintento
-- de gateway que duplicar). Solo acepta ofertas sobre necesidades elegibles
-- ('needed'/'partially_fulfilled') — 0 filas ⇒ el servicio traduce a un
-- error claro ("necesidad no encontrada o ya no acepta ofertas").
-- ============================================================================
CREATE OR REPLACE FUNCTION create_resource_offer(
  p_need_id UUID,
  p_donor_user_id UUID,
  p_quantity_offered INTEGER,
  p_message TEXT
)
  RETURNS SETOF "resource_offers"
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_organization_id UUID; o "resource_offers";
BEGIN
  SELECT "organization_id" INTO v_organization_id
    FROM "resource_needs"
    WHERE "id" = p_need_id AND "status" IN ('needed', 'partially_fulfilled');
  IF v_organization_id IS NULL THEN
    RETURN; -- necesidad desconocida o ya no acepta ofertas ⇒ 0 filas
  END IF;

  INSERT INTO "resource_offers" (
    "id", "organization_id", "need_id", "donor_user_id", "quantity_offered", "message", "status", "updated_at"
  ) VALUES (
    gen_random_uuid(), v_organization_id, p_need_id, p_donor_user_id, p_quantity_offered, p_message, 'offered', CURRENT_TIMESTAMP
  )
  RETURNING * INTO o;
  RETURN NEXT o;
END;
$$;

-- Las ofertas del DONANTE (para su bandeja "mis ofertas"), cross-tenant.
-- Devuelve JSONB ya enriquecido (título/unidad de la necesidad, nombre de la
-- organización) — evita que el servicio tenga que hacer una segunda lectura
-- cross-tenant acotada por ids solo para esos tres campos de despliegue.
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
      'deliveryCompletedAt', to_char(d.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ) AS item
    FROM "resource_offers" off
    JOIN "resource_needs" n ON n.id = off.need_id
    JOIN "organizations" o ON o.id = off.organization_id
    LEFT JOIN "resource_deliveries" d ON d.offer_id = off.id
    WHERE off.donor_user_id = p_user_id
  ) rows;
$$;

-- Cancelar la PROPIA oferta (guard de identidad: solo si sigue 'offered' y es
-- suya) — el donante no es miembro de la org beneficiaria.
CREATE OR REPLACE FUNCTION cancel_resource_offer(p_offer_id UUID, p_donor_user_id UUID)
  RETURNS SETOF "resource_offers"
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE o "resource_offers";
BEGIN
  UPDATE "resource_offers"
    SET "status" = 'cancelled', "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = p_offer_id AND "donor_user_id" = p_donor_user_id AND "status" = 'offered'
    RETURNING * INTO o;
  IF NOT FOUND THEN
    RETURN; -- no es suya, no existe, o ya no está 'offered' ⇒ 0 filas
  END IF;
  RETURN NEXT o;
END;
$$;

REVOKE ALL ON FUNCTION create_resource_offer(UUID, UUID, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION resource_offers_for_donor(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION cancel_resource_offer(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_resource_offer(UUID, UUID, INTEGER, TEXT) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION resource_offers_for_donor(UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION cancel_resource_offer(UUID, UUID) TO adoptafacil_app;

-- ============================================================================
-- Catálogo público de necesidades (mismo patrón que public_campaigns):
-- superficie mínima, sin autenticación, oculta 'cancelled' y cualquier dato
-- interno. Página + detalle.
-- ============================================================================
CREATE OR REPLACE FUNCTION public_resource_needs(p_limit INTEGER, p_offset INTEGER)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'items', COALESCE((SELECT jsonb_agg(item ORDER BY (item->>'createdAt') DESC) FROM (
      SELECT jsonb_build_object(
        'id', n.id,
        'organizationId', n.organization_id,
        'organizationName', o.name,
        'title', n.title,
        'description', n.description,
        'category', n.category,
        'quantityNeeded', n.quantity_needed,
        'unit', n.unit,
        'quantityFulfilled', n.quantity_fulfilled,
        'status', n.status,
        'createdAt', to_char(n.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) AS item
      FROM "resource_needs" n
      JOIN "organizations" o ON o.id = n.organization_id
      WHERE n.status IN ('needed', 'partially_fulfilled')
      ORDER BY n.created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
      OFFSET GREATEST(COALESCE(p_offset, 0), 0)
    ) page), '[]'::jsonb),
    'total', (SELECT count(*) FROM "resource_needs" WHERE "status" IN ('needed', 'partially_fulfilled'))
  );
$$;

CREATE OR REPLACE FUNCTION public_resource_need(p_id UUID)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', n.id,
    'organizationId', n.organization_id,
    'organizationName', o.name,
    'title', n.title,
    'description', n.description,
    'category', n.category,
    'quantityNeeded', n.quantity_needed,
    'unit', n.unit,
    'quantityFulfilled', n.quantity_fulfilled,
    'status', n.status,
    'createdAt', to_char(n.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )
  FROM "resource_needs" n
  JOIN "organizations" o ON o.id = n.organization_id
  WHERE n.id = p_id AND n.status IN ('needed', 'partially_fulfilled', 'fulfilled');
$$;

REVOKE ALL ON FUNCTION public_resource_needs(INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public_resource_need(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_resource_needs(INTEGER, INTEGER) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION public_resource_need(UUID) TO adoptafacil_app;

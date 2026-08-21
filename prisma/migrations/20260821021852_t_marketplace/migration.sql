-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "storage_ref" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_organization_id_idx" ON "products"("organization_id");

-- CreateIndex
CREATE INDEX "products_organization_id_category_idx" ON "products"("organization_id", "category");

-- CreateIndex
CREATE INDEX "products_organization_id_is_active_idx" ON "products"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "products_organization_id_name_key" ON "products"("organization_id", "name");

-- CreateIndex
CREATE INDEX "product_images_organization_id_idx" ON "product_images"("organization_id");

-- CreateIndex
CREATE INDEX "product_images_product_id_idx" ON "product_images"("product_id");

-- AddForeignKey (intra-module, modeled in Prisma)
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey to organizations (declared in SQL, NOT as a Prisma @relation,
-- to avoid editing the Organization model in org.prisma — another owner's file).
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ROW-LEVEL SECURITY (RNF03) — M10 marketplace. products and product_images
-- are tenant-scoped business data: an org only ever reads/edits its OWN rows.
-- Mirrors the canonical _rls_probe pattern.
-- ============================================================================

ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "products"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE "product_images" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_images" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "product_images"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- ============================================================================
-- LEAST-PRIVILEGE GRANTS (M10). A product is NEVER physically deleted — the
-- app role loses DELETE/TRUNCATE; deactivation is a soft toggle on is_active
-- (a normal UPDATE), mirroring campaigns/animals. Images allow removal/
-- replacement (mirrors animal_photos).
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON "products" TO adoptafacil_app;
REVOKE DELETE, TRUNCATE ON "products" FROM adoptafacil_app;

GRANT SELECT, INSERT, DELETE ON "product_images" TO adoptafacil_app;

-- ============================================================================
-- PUBLIC CATALOG (M10) — cross-tenant exposure through a bounded SECURITY
-- DEFINER function (only public columns + the owning org's name/WhatsApp),
-- never a raw RLS-evading select. Mirrors public_campaigns/public_resource_needs.
-- Only ACTIVE products are shown; optional category/organization filters.
-- ============================================================================

CREATE OR REPLACE FUNCTION public_products(
  p_limit INTEGER,
  p_offset INTEGER,
  p_category TEXT,
  p_organization_id UUID
)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'items', COALESCE((SELECT jsonb_agg(item ORDER BY (item->>'createdAt') DESC) FROM (
      SELECT jsonb_build_object(
        'id', p.id,
        'organizationId', p.organization_id,
        'organizationName', o.name,
        'organizationWhatsapp', op.whatsapp,
        'name', p.name,
        'description', p.description,
        'category', p.category,
        'price', p.price,
        'stock', p.stock,
        'images', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', i.id, 'storageRef', i.storage_ref, 'order', i.order
          ) ORDER BY i.order)
          FROM "product_images" i WHERE i.product_id = p.id
        ), '[]'::jsonb),
        'createdAt', to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) AS item
      FROM "products" p
      JOIN "organizations" o ON o.id = p.organization_id
      LEFT JOIN "organization_profiles" op ON op.organization_id = o.id
      WHERE p.is_active = true
        AND (p_category IS NULL OR p.category = p_category)
        AND (p_organization_id IS NULL OR p.organization_id = p_organization_id)
      ORDER BY p.created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 24), 1), 50)
      OFFSET GREATEST(COALESCE(p_offset, 0), 0)
    ) page), '[]'::jsonb),
    'total', (
      SELECT count(*) FROM "products"
      WHERE "is_active" = true
        AND (p_category IS NULL OR "category" = p_category)
        AND (p_organization_id IS NULL OR "organization_id" = p_organization_id)
    )
  );
$$;

CREATE OR REPLACE FUNCTION public_product(p_id UUID)
  RETURNS JSONB
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'organizationId', p.organization_id,
    'organizationName', o.name,
    'organizationWhatsapp', op.whatsapp,
    'name', p.name,
    'description', p.description,
    'category', p.category,
    'price', p.price,
    'stock', p.stock,
    'images', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'storageRef', i.storage_ref, 'order', i.order
      ) ORDER BY i.order)
      FROM "product_images" i WHERE i.product_id = p.id
    ), '[]'::jsonb),
    'createdAt', to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )
  FROM "products" p
  JOIN "organizations" o ON o.id = p.organization_id
  LEFT JOIN "organization_profiles" op ON op.organization_id = o.id
  WHERE p.id = p_id AND p.is_active = true;
$$;

REVOKE ALL ON FUNCTION public_products(INTEGER, INTEGER, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public_product(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_products(INTEGER, INTEGER, TEXT, UUID) TO adoptafacil_app;
GRANT EXECUTE ON FUNCTION public_product(UUID) TO adoptafacil_app;

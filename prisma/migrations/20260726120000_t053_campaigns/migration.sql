-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "goal_amount" INTEGER NOT NULL,
    "raised_amount" INTEGER NOT NULL DEFAULT 0,
    "deadline" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaigns_organization_id_idx" ON "campaigns"("organization_id");

-- CreateIndex
CREATE INDEX "campaigns_organization_id_status_idx" ON "campaigns"("organization_id", "status");

-- AddForeignKey to organizations (declared in SQL, NOT as a Prisma @relation, to
-- avoid editing the Organization model in org.prisma — another owner's file).
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ROW-LEVEL SECURITY (RNF03) — M06 campaigns (T-053). Tenant-scoped business
-- data: an org only ever reads/edits its OWN campaigns via the authenticated
-- path. Mirrors the canonical _rls_probe pattern.
-- ============================================================================
ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campaigns" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "campaigns"
  USING ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK ("organization_id" = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

-- Least privilege: read + insert + update (status/edit). Never DELETE — a
-- campaign is cancelled via `status`, not removed (append/soft management).
GRANT SELECT, INSERT, UPDATE ON "campaigns" TO adoptafacil_app;
REVOKE DELETE, TRUNCATE ON "campaigns" FROM adoptafacil_app;

-- ============================================================================
-- PUBLIC PORTAL READ (M14) — controlled exception to RLS. A public visitor has
-- NO tenant context, so a normal app-role read returns zero rows. Instead of a
-- privileged SELECT *, these SECURITY DEFINER functions run as their owner and
-- return ONLY the public columns (+ the owning org's display name). EXECUTE is
-- granted solely to the app role (never PUBLIC).
-- ============================================================================

-- Public list: ACTIVE campaigns across organizations, newest first, paginated
-- (limit clamped 1..50). Returns a JSONB array of public columns.
CREATE OR REPLACE FUNCTION public_campaigns(p_limit INTEGER, p_offset INTEGER)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'items', COALESCE(
      (
        SELECT jsonb_agg(item ORDER BY (item->>'createdAt') DESC)
        FROM (
          SELECT jsonb_build_object(
            'id', c.id,
            'organizationId', c.organization_id,
            'organizationName', o.name,
            'title', c.title,
            'description', c.description,
            'category', c.category,
            'goalAmount', c.goal_amount,
            'raisedAmount', c.raised_amount,
            'deadline', c.deadline,
            'status', c.status,
            'createdAt', c.created_at
          ) AS item
          FROM campaigns c
          JOIN organizations o ON o.id = c.organization_id
          WHERE c.status = 'active'
          ORDER BY c.created_at DESC
          LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
          OFFSET GREATEST(COALESCE(p_offset, 0), 0)
        ) page
      ),
      '[]'::jsonb
    ),
    'total', (SELECT count(*) FROM campaigns WHERE status = 'active')
  );
$$;

REVOKE ALL ON FUNCTION public_campaigns(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_campaigns(INTEGER, INTEGER) TO adoptafacil_app;

-- Public detail: one campaign by id, exposed only when active or closed (a
-- cancelled campaign is not surfaced publicly → NULL). Public columns only.
CREATE OR REPLACE FUNCTION public_campaign(p_id UUID)
  RETURNS JSONB
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', c.id,
    'organizationId', c.organization_id,
    'organizationName', o.name,
    'title', c.title,
    'description', c.description,
    'category', c.category,
    'goalAmount', c.goal_amount,
    'raisedAmount', c.raised_amount,
    'deadline', c.deadline,
    'status', c.status,
    'createdAt', c.created_at
  )
  FROM campaigns c
  JOIN organizations o ON o.id = c.organization_id
  WHERE c.id = p_id AND c.status IN ('active', 'closed');
$$;

REVOKE ALL ON FUNCTION public_campaign(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public_campaign(UUID) TO adoptafacil_app;

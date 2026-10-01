-- M14 · Banner (hero) administrable del portal general `/`.
-- Tabla GLOBAL de PLATAFORMA (no de negocio por tenant): sin organization_id y
-- sin RLS, igual que `platform_settings` (T-030) y `organizations`. Solo el
-- controller gateado a PlatformAdmin/PlatformSuperAdmin la escribe; cada cambio
-- se audita. Máx. 4 slots (position 0..3 por CHECK + tope en el servicio).

CREATE TABLE "portal_banner_photos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "position" INTEGER NOT NULL,
    "storage_ref" TEXT NOT NULL,
    "alt_text" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_banner_photos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "portal_banner_photos_position_range" CHECK ("position" BETWEEN 0 AND 3),
    CONSTRAINT "portal_banner_photos_alt_text_nonblank" CHECK (length(btrim("alt_text")) > 0)
);

CREATE INDEX "portal_banner_photos_position_idx" ON "portal_banner_photos"("position");

-- El rol de runtime gestiona las filas (lista corta y reordenable); nunca TRUNCATE.
GRANT SELECT, INSERT, UPDATE, DELETE ON "portal_banner_photos" TO adoptafacil_app;
REVOKE TRUNCATE ON "portal_banner_photos" FROM adoptafacil_app;

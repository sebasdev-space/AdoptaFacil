-- M01/T-030 · S-15 (pedido del cliente, 2026-10-05): el PlatformAdmin puede
-- subir hasta 4 fotos para el banner del portal general ("/", HeroPhotoGrid),
-- reemplazando el collage decorativo de íconos fijos. Mismo patrón que
-- `organization_profiles.cover_photos` (array de URLs públicas ya resueltas
-- vía StoragePort). Default vacío: el banner sigue mostrando el collage
-- decorativo mientras no se haya subido ninguna foto — nunca una caja rota.
ALTER TABLE "platform_settings"
  ADD COLUMN "hero_banner_photos" TEXT[] NOT NULL DEFAULT '{}';

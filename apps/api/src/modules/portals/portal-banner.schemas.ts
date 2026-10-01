import { z } from 'zod';

/**
 * Banner del portal general (M14) — validación de entrada de los endpoints de
 * PlatformAdmin. `.strict()` rechaza llaves desconocidas (deny-by-default).
 * El alt text es OBLIGATORIO (accesibilidad): no se acepta vacío ni en blanco.
 */

/** Tipos de imagen aceptados para el banner (sin GIF ni PDF). */
export const BANNER_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Tope de tamaño de una foto del banner (bytes) — verificado sobre los bytes
 *  YA subidos a StoragePort al registrar la foto. */
export const BANNER_MAX_BYTES = 5 * 1024 * 1024;

const altText = z.string().trim().min(1, 'El texto alternativo es obligatorio').max(200);

export const bannerUploadTargetSchema = z
  .object({
    filename: z.string().trim().min(1).max(200),
    contentType: z.enum(BANNER_CONTENT_TYPES),
  })
  .strict();

export const createBannerPhotoSchema = z
  .object({
    storageKey: z.string().trim().min(1).max(512),
    altText,
  })
  .strict();

export const updateBannerPhotoSchema = z
  .object({
    altText: altText.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.altText !== undefined || v.isActive !== undefined, {
    message: 'Nada que actualizar',
  });

export const reorderBannerSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1).max(4),
  })
  .strict();

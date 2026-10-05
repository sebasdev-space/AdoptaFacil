import { z } from 'zod';

/** Validation for a platform-settings update (PlatformAdmin only). `.strict()`
 *  rejects unknown keys. `heroBannerPhotos` (S-15) es OPCIONAL (contrato
 *  aditivo, no rompe un caller existente que solo manda `showOrganizationType`):
 *  ausente = no tocar el banner actual; hasta 4 URLs públicas cuando se envía. */
export const updatePlatformSettingsSchema = z
  .object({
    showOrganizationType: z.enum(['all', 'formalized_only']),
    heroBannerPhotos: z
      .array(z.string().trim().url().max(2000))
      .max(4, 'Solo se admiten hasta 4 fotos para el banner.')
      .optional(),
  })
  .strict();

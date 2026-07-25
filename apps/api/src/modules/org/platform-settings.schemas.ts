import { z } from 'zod';

/** Validation for a platform-settings update (PlatformAdmin only). `.strict()`
 *  rejects unknown keys. */
export const updatePlatformSettingsSchema = z
  .object({
    showOrganizationType: z.enum(['all', 'formalized_only']),
  })
  .strict();

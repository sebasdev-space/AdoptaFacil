import { z } from 'zod';

/** Runtime validation for a PlatformAdmin/PlatformSuperAdmin decision on a
 *  flagged possible duplicate organization (S-3). `.strict()` rejects unknown
 *  keys. */
export const reviewDuplicateFlagSchema = z
  .object({ decision: z.enum(['dismiss', 'confirm']) })
  .strict();

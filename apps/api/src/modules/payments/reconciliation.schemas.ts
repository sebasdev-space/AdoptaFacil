import { z } from 'zod';

/** Query validation for the reconciliation report (M15b, RF26). `.strict()`
 *  rejects unknown keys — same convention as donations. All params optional:
 *  the service applies sensible defaults (last 12 months, all organizations). */
export const reconciliationQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    organizationId: z.string().uuid().optional(),
  })
  .strict();

export type ReconciliationQuery = z.infer<typeof reconciliationQuerySchema>;

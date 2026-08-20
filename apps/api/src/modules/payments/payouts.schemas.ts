import { z } from 'zod';

/** Runtime validation for triggering a payout (M15b, RF26). `.strict()`
 *  rejects unknown keys — same convention as donations. */
export const requestPayoutSchema = z
  .object({
    organizationId: z.string().uuid(),
    amount: z.number().int('El monto debe ser un número entero de pesos.').positive(),
    idempotencyKey: z.string().trim().min(8).max(200),
  })
  .strict();

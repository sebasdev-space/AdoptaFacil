import { z } from 'zod';

export const createResourceOfferSchema = z
  .object({
    needId: z.string().uuid(),
    quantityOffered: z.number().int('La cantidad debe ser un número entero.').positive(),
    message: z.string().trim().max(1000).optional(),
  })
  .strict();

export const decideResourceOfferSchema = z
  .object({
    decision: z.enum(['accept', 'decline']),
  })
  .strict();

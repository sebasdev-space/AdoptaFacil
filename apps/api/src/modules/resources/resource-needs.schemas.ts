import { z } from 'zod';
import { ResourceCategory, ResourceNeedStatus } from '@adoptafacil/contracts';

/** Runtime validation for M09 needs. `.strict()` rejects unknown keys — same
 *  convention as campaigns/donations. Quantities are always positive integers
 *  (a resource need is never a fraction of a unit). */
const quantity = z.number().int('La cantidad debe ser un número entero.').positive();

export const createResourceNeedSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).optional(),
    category: z.nativeEnum(ResourceCategory),
    quantityNeeded: quantity,
    unit: z.string().trim().min(1).max(40),
  })
  .strict();

export const updateResourceNeedSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).optional(),
    category: z.nativeEnum(ResourceCategory).optional(),
    quantityNeeded: quantity.optional(),
    unit: z.string().trim().min(1).max(40).optional(),
    // La ÚNICA transición manual de estado — partially_fulfilled/fulfilled
    // los deriva el backend al completar entregas, nunca el cliente.
    status: z.literal(ResourceNeedStatus.Cancelled).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Debe incluirse al menos un campo.',
  });

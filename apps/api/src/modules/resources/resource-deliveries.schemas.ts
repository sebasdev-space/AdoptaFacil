import { z } from 'zod';
import { ResourceDeliveryMethod } from '@adoptafacil/contracts';

/** Fijar/actualizar método y fecha mientras la entrega sigue `scheduled`. */
export const scheduleResourceDeliverySchema = z
  .object({
    method: z.nativeEnum(ResourceDeliveryMethod).optional(),
    scheduledAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Debe incluirse al menos un campo.',
  });

/** Cerrar la entrega como completada. */
export const completeResourceDeliverySchema = z
  .object({
    actualQuantity: z.number().int('La cantidad debe ser un número entero.').positive().optional(),
  })
  .strict();

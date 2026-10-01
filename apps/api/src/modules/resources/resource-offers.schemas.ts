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

export const validateResourceOfferProofSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    reason: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine((v) => v.decision === 'approve' || (v.reason !== undefined && v.reason.length > 0), {
    message: 'Indica el motivo del rechazo.',
    path: ['reason'],
  });

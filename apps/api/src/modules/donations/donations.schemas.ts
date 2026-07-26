import { z } from 'zod';
import { MIN_DONATION_AMOUNT } from '@adoptafacil/contracts';

/** Runtime validation for M05 donations (T-050). `.strict()` rejects unknown keys
 *  so no extra field (e.g. a client-supplied breakdown) can be smuggled in — the
 *  API is the sole authority on the money math (computeBreakdown). */

const uuid = z.string().uuid();

/** Pesos enteros COP, positivos, por encima del mínimo (P1). */
const pesos = z
  .number()
  .int('El monto debe ser un número entero de pesos.')
  .min(MIN_DONATION_AMOUNT, `El monto mínimo es ${MIN_DONATION_AMOUNT} COP.`);

const donorSchema = z
  .object({
    fullName: z.string().trim().min(1).max(200).optional(),
    email: z.string().trim().toLowerCase().email().max(320).optional(),
    documentId: z.string().trim().max(40).optional(),
  })
  .strict();

const conceptSchema = z
  .object({
    kind: z.enum(['organization', 'animal', 'campaign']),
    id: uuid,
  })
  .strict();

export const createDonationSchema = z
  .object({
    organizationId: uuid,
    intendedAmount: pesos,
    commissionPayer: z.enum(['organization', 'donor']),
    concept: conceptSchema.optional(),
    payer: donorSchema.optional(),
    idempotencyKey: z.string().trim().min(8).max(200),
  })
  .strict();

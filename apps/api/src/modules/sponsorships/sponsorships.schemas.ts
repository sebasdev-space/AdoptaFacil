import { z } from 'zod';
import { SponsorshipPeriodicity } from '@adoptafacil/contracts';

const uuid = z.string().uuid();

/** Create a sponsorship plan. `.strict()` rejects unknown keys. Money is
 *  integer COP > 0 (never float), coherent with the money engine. */
export const createSponsorshipPlanSchema = z
  .object({
    animalId: uuid,
    name: z.string().trim().min(1).max(200),
    amount: z.number().int().positive(),
    periodicity: z.nativeEnum(SponsorshipPeriodicity),
  })
  .strict();

/** Patch a plan. At least one field must be present. */
export const updateSponsorshipPlanSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    amount: z.number().int().positive().optional(),
    periodicity: z.nativeEnum(SponsorshipPeriodicity).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

/** Subscribe to a plan (authenticated Person = the padrino). */
export const createSponsorshipSchema = z
  .object({
    planId: uuid,
  })
  .strict();

/** Optional free-text reason accompanying a suspend/cancel action. */
export const sponsorshipStatusChangeSchema = z
  .object({
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

/**
 * Body of `POST /sponsorships/:id/retry-payment` (T-OrdersAPI). All optional
 * on purpose (same reasoning as `createDonationSchema`'s card fields): the
 * real gateway adapter is the one place that hard-requires a token, so
 * existing callers/tests that post no body at all keep working unchanged.
 */
export const paySponsorshipPaymentSchema = z
  .object({
    cardToken: z.string().trim().min(10).max(2000).optional(),
    paymentMethodId: z.string().trim().min(1).max(50).optional(),
    paymentMethodType: z.enum(['credit_card', 'debit_card']).optional(),
    installments: z.coerce.number().int().min(1).max(36).optional(),
  })
  .strict();

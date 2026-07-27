import { z } from 'zod';
import { CampaignEvidenceType } from '@adoptafacil/contracts';

/**
 * Create a spending evidence. `.strict()` rejects unknown keys. `amount` is
 * OPTIONAL (a photo may carry no monetary value); when present it must be a
 * POSITIVE INTEGER COP (money is never float; negative/non-integer → 400).
 */
export const createCampaignEvidenceSchema = z
  .object({
    type: z.nativeEnum(CampaignEvidenceType),
    concept: z.string().trim().min(1).max(500),
    amount: z.number().int().positive().optional(),
    spentAt: z.string().datetime({ offset: true }),
    filename: z.string().trim().min(1).max(255),
    contentType: z.string().trim().min(1).max(150).optional(),
    order: z.number().int().min(0).optional(),
  })
  .strict();

/** Patch an evidence's business fields (the file is immutable). At least one. */
export const updateCampaignEvidenceSchema = z
  .object({
    type: z.nativeEnum(CampaignEvidenceType).optional(),
    concept: z.string().trim().min(1).max(500).optional(),
    amount: z.number().int().positive().optional(),
    spentAt: z.string().datetime({ offset: true }).optional(),
    order: z.number().int().min(0).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

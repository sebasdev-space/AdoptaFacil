import { z } from 'zod';
import { CampaignCategory, CampaignStatus } from '@adoptafacil/contracts';

/** Create a campaign. `.strict()` rejects unknown keys. Money is integer COP > 0. */
export const createCampaignSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).optional(),
    category: z.nativeEnum(CampaignCategory),
    goalAmount: z.number().int().positive(),
    deadline: z.string().datetime({ offset: true }),
  })
  .strict();

/** Patch a campaign. At least one field must be present. */
export const updateCampaignSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).optional(),
    category: z.nativeEnum(CampaignCategory).optional(),
    goalAmount: z.number().int().positive().optional(),
    deadline: z.string().datetime({ offset: true }).optional(),
    status: z.nativeEnum(CampaignStatus).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

import { z } from 'zod';
import { ClinicalEventType } from '@adoptafacil/contracts';

/** Free-form clinical detail (no invented medical schema). Capped to a sane size. */
const details = z.record(z.string(), z.unknown());

const attachment = z
  .object({
    filename: z.string().trim().min(1).max(255),
    contentType: z.string().trim().max(150).optional(),
    order: z.number().int().min(0).max(1000).optional(),
  })
  .strict();

/** Create a clinical event (version 1). Veterinarian only. */
export const createClinicalEventSchema = z
  .object({
    type: z.nativeEnum(ClinicalEventType),
    occurredAt: z.string().datetime({ offset: true }),
    nextDueDate: z.string().datetime({ offset: true }).optional(),
    details: details.optional(),
    attachments: z.array(attachment).max(20).optional(),
  })
  .strict();

/** Edit a clinical event → next version. At least one field must be present. */
export const editClinicalEventSchema = z
  .object({
    type: z.nativeEnum(ClinicalEventType).optional(),
    occurredAt: z.string().datetime({ offset: true }).optional(),
    nextDueDate: z.string().datetime({ offset: true }).optional(),
    details: details.optional(),
    attachments: z.array(attachment).max(20).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided to create a new version.',
  });

import { z } from 'zod';
import { ClinicalEventType } from '@adoptafacil/contracts';

/** Free-form clinical detail (no invented medical schema). Capped to a sane size. */
const details = z.record(z.string(), z.unknown());

/** `storageRef` of an attachment ALREADY uploaded via `POST .../clinical-events/uploads`
 *  + `PUT /storage/upload?key=…` (fix, T-ANIMALS-ATTACHMENTS-AUDIT) — never a bare
 *  filename the backend would mint its own never-uploaded-to key for. */
const attachment = z
  .object({
    storageRef: z.string().trim().min(1).max(500),
    order: z.number().int().min(0).max(1000).optional(),
  })
  .strict();

/** Reserve a storage target for ONE clinical attachment (private object). */
export const createAttachmentUploadSchema = z
  .object({
    filename: z.string().trim().min(1).max(255),
    contentType: z.string().trim().max(150).optional(),
  })
  .strict();

/** Create a clinical event (version 1). Owner/Administrator/Operator/Veterinarian
 *  (fix, T-ANIMALS-ATTACHMENTS-AUDIT: previously Veterinarian-only). */
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

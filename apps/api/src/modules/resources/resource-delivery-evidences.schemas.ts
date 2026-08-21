import { z } from 'zod';
import { ALLOWED_CONTENT_TYPES } from '../../core/storage/storage-keys';

export const createResourceDeliveryEvidenceSchema = z
  .object({
    caption: z.string().trim().max(500).optional(),
    filename: z.string().trim().min(1).max(255),
    contentType: z.enum(ALLOWED_CONTENT_TYPES as [string, ...string[]]).optional(),
    order: z.number().int().min(0).optional(),
  })
  .strict();

import { z } from 'zod';

/** A reason is required to `remove` (re-enforced by the DB function too,
 *  same defense-in-depth as `platform_document_decide`); optional to
 *  `restore`. */
export const moderatePostSchema = z
  .object({
    decision: z.enum(['remove', 'restore']),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .refine((value) => value.decision !== 'remove' || !!value.reason, {
    message: 'Se requiere un motivo para retirar una publicación.',
    path: ['reason'],
  });

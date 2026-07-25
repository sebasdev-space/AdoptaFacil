import { z } from 'zod';

/** Runtime validation for M04 post-adoption follow-up (T-028c). `.strict()` rejects
 *  unknown keys so no extra field can be smuggled in. */

const uuid = z.string().uuid();

const questionSchema = z
  .object({
    id: uuid.optional(),
    prompt: z.string().trim().min(1).max(500),
    kind: z.enum(['text', 'boolean', 'photo']),
    required: z.boolean().optional(),
  })
  .strict();

export const scheduleFollowUpSchema = z
  .object({
    contractId: uuid,
    title: z.string().trim().min(1).max(200),
    /** ISO-8601 UTC del vencimiento. */
    dueAt: z.string().datetime(),
    questionnaire: z.array(questionSchema).max(50).optional(),
  })
  .strict();

export const submitFollowUpSchema = z
  .object({
    answers: z.record(z.string(), z.unknown()).optional(),
    photoFilename: z.string().trim().min(1).max(300).optional(),
    complete: z.boolean().optional(),
  })
  .strict()
  .refine((d) => d.answers !== undefined || d.photoFilename !== undefined, {
    message: 'Debes enviar respuestas del cuestionario o una foto.',
  });

import { z } from 'zod';
import { FormalizationState } from '@adoptafacil/contracts';

/** Validation for a formalization transition request. `.strict()` rejects
 *  unknown keys; `targetState` must be a valid FormalizationState. */
export const requestTransitionSchema = z
  .object({
    targetState: z.nativeEnum(FormalizationState),
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

import { z } from 'zod';

const childrenCompatibility = z.enum(['yes', 'with_supervision', 'not_recommended']);

/** Declare (and sign) an animal's behavior disclosure. Signs and creates
 *  atomically — see AnimalBehaviorDisclosureService.create. */
export const createAnimalBehaviorDisclosureSchema = z
  .object({
    signedByName: z.string().trim().min(1).max(200),
    reactivityNotes: z.string().trim().min(1).max(2000).optional(),
    biteHistory: z.boolean(),
    biteHistoryDetail: z.string().trim().min(1).max(2000).optional(),
    childrenCompatibility,
    medicalConditionsRelevant: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

import { z } from 'zod';

/** Runtime validation for M04 adoption CONTRACTS (T-028b). `.strict()` rejects
 *  unknown keys so no extra field can be smuggled in. */

const uuid = z.string().uuid();

const signerInputSchema = z
  .object({
    role: z.enum(['organization_representative', 'adopter', 'witness']),
    fullName: z.string().trim().min(1).max(200),
    email: z.string().trim().toLowerCase().email().max(320),
    userId: uuid.optional(),
  })
  .strict();

export const generateAdoptionContractSchema = z
  .object({
    requestId: uuid,
    additionalSigners: z.array(signerInputSchema).max(10).optional(),
    terms: z.string().trim().min(1).max(20000).optional(),
  })
  .strict();

export const transitionAdoptionContractSchema = z
  .object({
    targetStatus: z.enum(['pending_signatures', 'cancelled']),
    reason: z.string().trim().max(1000).optional(),
  })
  .strict();

export const signAdoptionContractSchema = z
  .object({
    signerId: uuid,
  })
  .strict();

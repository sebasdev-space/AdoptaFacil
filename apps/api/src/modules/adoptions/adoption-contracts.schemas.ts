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

/** `signatureBase64` is validated as REQUIRED only for non-representative
 *  signers — the role is only known once the service loads the contract, so
 *  that part of the check lives in `AdoptionContractsService.sign`, not here. */
export const signAdoptionContractSchema = z
  .object({
    signerId: uuid,
    signatureBase64: z.string().trim().min(1).max(2_000_000).optional(),
    signatureContentType: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

/**
 * `PATCH /adoptions/contracts/:id/data` — cualquier subconjunto de
 * `AdoptionContractData` (requerimiento: diligenciar peso/estado de salud +
 * corregir cualquier campo auto-rellenado). Todos opcionales: el cliente
 * envía solo lo que cambió.
 */
export const updateAdoptionContractDataSchema = z
  .object({
    organizationNit: z.string().trim().min(1).max(50).optional(),
    organizationAddress: z.string().trim().min(1).max(300).optional(),
    animalBreed: z.string().trim().min(1).max(200).optional(),
    animalSex: z.string().trim().min(1).max(50).optional(),
    animalAgeYears: z.number().min(0).max(100).optional(),
    weightKg: z.number().positive().max(500).optional(),
    healthStatusAtDelivery: z.string().trim().min(1).max(2000).optional(),
    adopterDocumentNumber: z.string().trim().min(1).max(50).optional(),
    adopterAddress: z.string().trim().min(1).max(300).optional(),
    followUpMonths: z.number().int().positive().max(60).optional(),
    signatureCity: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

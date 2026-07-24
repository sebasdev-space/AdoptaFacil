import { z } from 'zod';
import { ADOPTION_MESSAGE_MIN_LENGTH, ADOPTION_STATUSES } from '@adoptafacil/contracts';

/** Runtime validation for M04 adoption requests (T-028a). `.strict()` rejects
 *  unknown keys so no extra field can be smuggled in. */

const uuid = z.string().uuid();

const applicantSchema = z
  .object({
    fullName: z.string().trim().min(1).max(200),
    email: z.string().trim().toLowerCase().email().max(320),
    phone: z.string().trim().max(30).optional(),
  })
  .strict();

const animalSnapshotSchema = z
  .object({
    animalId: uuid,
    name: z.string().trim().min(1).max(200),
    species: z.enum(['dog', 'cat', 'other']),
    photoUrl: z.string().trim().url().max(2000).optional(),
  })
  .strict();

export const createAdoptionRequestSchema = z
  .object({
    animalId: uuid,
    organizationId: uuid,
    animalSnapshot: animalSnapshotSchema,
    applicant: applicantSchema,
    // RF10: mensaje mínimo argumentado (no un clic).
    message: z.string().trim().min(ADOPTION_MESSAGE_MIN_LENGTH).max(5000),
  })
  .strict()
  .refine((d) => d.animalSnapshot.animalId === d.animalId, {
    message: 'animalSnapshot.animalId must match animalId',
    path: ['animalSnapshot', 'animalId'],
  });

export const transitionAdoptionRequestSchema = z
  .object({
    targetStatus: z.enum(ADOPTION_STATUSES as unknown as [string, ...string[]]),
    reason: z.string().trim().max(1000).optional(),
  })
  .strict();

import { z } from 'zod';

/** Enums mirror the STABLE contract value sets (animals.ts). Exported so
 *  `bulk-import.schemas.ts` (S2-04B-1) validates rows against the SAME rules
 *  instead of duplicating them and risking drift. */
export const species = z.enum(['dog', 'cat', 'other']);
export const sex = z.enum(['male', 'female', 'unknown']);
export const size = z.enum(['small', 'medium', 'large']);
const status = z.enum(['available', 'in_process', 'adopted', 'unavailable']);

const photoInput = z
  .object({
    filename: z.string().trim().min(1).max(255),
    contentType: z.string().trim().max(150).optional(),
    order: z.number().int().min(0).max(1000).optional(),
  })
  .strict();

/** Personality tags (S2-04A) — free text, max 10, no empty/oversized entries. */
export const tags = z.array(z.string().trim().min(1).max(40)).max(10);

/** Create an animal record. `.strict()` rejects unknown keys. */
export const createAnimalSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    species,
    sex,
    size,
    status: status.optional(),
    breedId: z.string().uuid().optional(),
    customBreed: z.string().trim().min(1).max(80).optional(),
    birthDate: z.string().datetime({ offset: true }).optional(),
    approximateAgeMonths: z.number().int().min(0).max(1200).optional(),
    description: z.string().trim().max(5000).optional(),
    tags: tags.optional(),
    photos: z.array(photoInput).max(20).optional(),
  })
  .strict();

/** Patch an animal record. At least one field must be present. */
export const updateAnimalSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    species: species.optional(),
    sex: sex.optional(),
    size: size.optional(),
    status: status.optional(),
    breedId: z.string().uuid().optional(),
    customBreed: z.string().trim().min(1).max(80).optional(),
    birthDate: z.string().datetime({ offset: true }).optional(),
    approximateAgeMonths: z.number().int().min(0).max(1200).optional(),
    description: z.string().trim().max(5000).optional(),
    tags: tags.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

export const addPhotoSchema = photoInput;

export const createBreedSchema = z
  .object({
    species,
    name: z.string().trim().min(1).max(80),
  })
  .strict();

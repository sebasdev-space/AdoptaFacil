import { z } from 'zod';

/** Enums mirror the STABLE contract value sets (animals.ts). */
const species = z.enum(['dog', 'cat', 'other']);
const sex = z.enum(['male', 'female', 'unknown']);
const size = z.enum(['small', 'medium', 'large']);
const status = z.enum(['available', 'in_process', 'adopted', 'unavailable']);

const photoInput = z
  .object({
    filename: z.string().trim().min(1).max(255),
    contentType: z.string().trim().max(150).optional(),
    order: z.number().int().min(0).max(1000).optional(),
  })
  .strict();

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

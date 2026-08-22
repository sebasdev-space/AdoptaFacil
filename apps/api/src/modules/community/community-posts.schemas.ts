import { z } from 'zod';
import { PostType } from '@adoptafacil/contracts';

/** Runtime validation for M11 posts. `.strict()` rejects unknown keys — same
 *  convention as campaigns/resources/marketplace. Body length mirrors the
 *  plan's spec (10–2000 characters) verbatim. */
const postImageInputSchema = z
  .object({
    filename: z.string().trim().min(1),
    contentType: z.enum(['image/jpeg', 'image/png']),
    order: z.number().int().nonnegative().optional(),
  })
  .strict();

export const createPostSchema = z
  .object({
    type: z.nativeEnum(PostType),
    title: z.string().trim().min(1).max(200).optional(),
    body: z.string().trim().min(10).max(2000),
    images: z.array(postImageInputSchema).max(6).optional(),
  })
  .strict();

export const updatePostSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    body: z.string().trim().min(10).max(2000).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Debe incluirse al menos un campo.',
  });

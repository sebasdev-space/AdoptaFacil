import { z } from 'zod';

/** Runtime validation for the M01 organization-profile update. `.strict()`
 *  rejects unknown keys, so formalization/verification fields can never be set
 *  through this endpoint (they are driven by the M01 state machine, T-102). */

const shortText = (max: number) => z.string().trim().max(max);
const url = z.string().trim().url().max(2000);
/** lowercase slug: letters/digits separated by single hyphens. */
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(63)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be a lowercase slug (letters, digits, hyphens)');

export const updateOrgProfileSchema = z
  .object({
    name: shortText(200).min(1).optional(),
    nit: shortText(50).optional(),
    legalName: shortText(200).optional(),
    description: shortText(5000).optional(),
    logoUrl: url.optional(),
    coverPhotos: z.array(url).max(20).optional(),
    whatsapp: shortText(30).optional(),
    contactEmail: z.string().trim().toLowerCase().email().max(320).optional(),
    phone: shortText(30).optional(),
    location: z
      .object({
        country: shortText(100).optional(),
        department: shortText(100).optional(),
        city: shortText(100).optional(),
        address: shortText(300).optional(),
      })
      .strict()
      .optional(),
    socialLinks: z
      .object({
        instagram: url.optional(),
        facebook: url.optional(),
        tiktok: url.optional(),
        website: url.optional(),
      })
      .strict()
      .optional(),
    subdomain: slug.optional(),
    slug: slug.optional(),
  })
  .strict();

export const uploadTargetSchema = z
  .object({
    filename: z.string().trim().min(1).max(255),
    contentType: z.string().trim().max(150).optional(),
  })
  .strict();

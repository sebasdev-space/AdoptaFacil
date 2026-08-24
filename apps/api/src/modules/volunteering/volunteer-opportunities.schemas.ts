import { z } from 'zod';
import { VolunteerOpportunityStatus } from '@adoptafacil/contracts';

const dateTime = z.string().datetime({ offset: true });

/** Publish an opportunity (Owner/Administrator). `.strict()` rejects unknown
 *  keys. `endDate` must be after `startDate` (enforced here, not just by DB
 *  column order). */
export const createVolunteerOpportunitySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000).optional(),
    category: z.string().trim().min(1).max(100),
    startDate: dateTime,
    endDate: dateTime,
    capacity: z.number().int().positive().optional(),
    location: z.string().trim().min(1).max(300),
    requirements: z.string().trim().max(2000).optional(),
    appliesToStudentService: z.boolean().optional(),
  })
  .strict()
  .refine((value) => new Date(value.endDate).getTime() > new Date(value.startDate).getTime(), {
    message: 'endDate must be after startDate.',
    path: ['endDate'],
  });

/** Patch an opportunity. All fields optional; only provided fields change. */
export const updateVolunteerOpportunitySchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    startDate: dateTime.optional(),
    endDate: dateTime.optional(),
    capacity: z.number().int().positive().optional(),
    location: z.string().trim().min(1).max(300).optional(),
    requirements: z.string().trim().max(2000).optional(),
    status: z.nativeEnum(VolunteerOpportunityStatus).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided.',
  });

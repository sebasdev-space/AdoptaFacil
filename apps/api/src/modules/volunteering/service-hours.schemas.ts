import { z } from 'zod';

/** Log a service-hours session against the caller's OWN accepted enrollment.
 *  `hours` is fractional (e.g. 2.5), POSITIVE — never money, so no
 *  integer-only rule applies here. */
export const logServiceHoursSchema = z
  .object({
    enrollmentId: z.string().uuid(),
    date: z.string().datetime({ offset: true }),
    hours: z.number().positive().max(24),
    description: z.string().trim().min(1).max(1000),
  })
  .strict();

/** Owner/Administrator decision on a pending hours entry. `reason` is
 *  REQUIRED for `reject`. */
export const decideServiceHoursSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    reason: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.decision === 'approve' || (value.reason !== undefined && value.reason.length > 0),
    { message: 'A reason is required to reject a service-hours entry.', path: ['reason'] },
  );

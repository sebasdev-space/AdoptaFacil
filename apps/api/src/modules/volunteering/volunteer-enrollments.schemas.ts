import { z } from 'zod';

/** Enroll in an opportunity. `.strict()` rejects unknown keys. */
export const createVolunteerEnrollmentSchema = z
  .object({ opportunityId: z.string().uuid() })
  .strict();

/** Owner/Administrator decision on a pending enrollment. `reason` is REQUIRED
 *  for `reject` — same criterion as the platform document review queue. */
export const decideVolunteerEnrollmentSchema = z
  .object({
    decision: z.enum(['accept', 'reject']),
    reason: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.decision === 'accept' || (value.reason !== undefined && value.reason.length > 0),
    { message: 'A reason is required to reject an enrollment.', path: ['reason'] },
  );

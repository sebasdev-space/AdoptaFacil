import { z } from 'zod';

/**
 * Enroll in an opportunity. `.strict()` rejects unknown keys. Guardian/school
 * fields are NOT required here even when `isMinor` is true (S-12, FSD v3.5
 * Doc 8) — a minor may enroll before supplying guardian info; the real gate
 * is at certificate issuance (`VolunteerCertificatesService.issue`), since
 * enrollment-time enforcement would need to know the opportunity's
 * `appliesToStudentService` flag, which this schema has no access to without
 * a DB lookup.
 */
export const createVolunteerEnrollmentSchema = z
  .object({
    opportunityId: z.string().uuid(),
    isMinor: z.boolean().optional(),
    guardianName: z.string().trim().min(1).max(200).optional(),
    guardianDocument: z.string().trim().min(1).max(50).optional(),
    schoolName: z.string().trim().min(1).max(200).optional(),
    schoolAgreementCode: z.string().trim().min(1).max(100).optional(),
  })
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

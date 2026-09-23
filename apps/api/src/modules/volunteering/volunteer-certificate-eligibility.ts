/**
 * Certificate math (RF18/RF19). Pure and framework-free so it is trivial to
 * unit-test. "Horas efectivas" = SUM of hours across entries whose status is
 * `approved` — pending/rejected NEVER count (RF19: "las instituciones no
 * certifican horas parciales"). Hours are fractional (e.g. 2.5), never money.
 */
export function sumApprovedHours(
  entries: ReadonlyArray<{ status: string; hours: number }>,
): number {
  return entries
    .filter((entry) => entry.status === 'approved')
    .reduce((total, entry) => total + entry.hours, 0);
}

/**
 * Minimum effective hours for the student social service certificate (RF19,
 * Resolución 4210/1996 art. 6°). 80h is the legal default the base document
 * cites; a specific school/organization agreement could differ —
 * TODO(client): expose a per-organization override if that need
 * materializes. Until then this is a single server-side configurable
 * default (env var), never hardcoded without an adjustment path.
 */
const DEFAULT_STUDENT_SERVICE_MIN_HOURS = 80;

export function studentServiceMinHours(): number {
  const raw = process.env.STUDENT_SERVICE_MIN_HOURS;
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_STUDENT_SERVICE_MIN_HOURS;
}

export interface CertificateEligibility {
  eligible: boolean;
  /** Present only when `eligible` is false — how many more approved hours
   *  are needed (rounded to 2 decimals, since hours are fractional). */
  missingHours?: number;
}

/**
 * General volunteering (`appliesToStudentService=false`) has NO minimum — the
 * base document does not fix one, so a certificate reflects whatever approved
 * hours exist, even zero. Student social service (`true`) is gated on
 * `minHours` (RF19) — never bypassable by rounding up.
 */
export function checkCertificateEligibility(
  appliesToStudentService: boolean,
  approvedHours: number,
  minHours: number,
): CertificateEligibility {
  if (!appliesToStudentService) {
    return { eligible: true };
  }
  if (approvedHours >= minHours) {
    return { eligible: true };
  }
  return { eligible: false, missingHours: Math.round((minHours - approvedHours) * 100) / 100 };
}

/**
 * S-12 (FSD v3.5 Doc 8): a MINOR's student-service constancia must name a
 * guardian who authorized the engagement — the client's own template shows
 * "quien actúa con la debida autorización de su acudiente". Only applies when
 * BOTH `appliesToStudentService` and `isMinor` are true; general volunteering
 * or an adult's enrollment never needs this. The check is at ISSUANCE (not
 * enrollment) — see `VolunteerEnrollment.guardianName`'s doc comment for why.
 */
export function missingGuardianInfo(
  appliesToStudentService: boolean,
  isMinor: boolean,
  guardianName: string | null | undefined,
  guardianDocument: string | null | undefined,
): boolean {
  if (!appliesToStudentService || !isMinor) {
    return false;
  }
  return !guardianName?.trim() || !guardianDocument?.trim();
}

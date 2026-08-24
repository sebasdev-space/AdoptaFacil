// Module: M08 volunteering · Contracts owner: @sebastian
//
// Volunteer opportunities + student social service (RF18/RF19, §10/§14 base
// document). An organization publishes opportunities; a Person (voluntario —
// same identity model as a sponsor/donor, cross-tenant, never an org member)
// enrolls, logs hours, and — once enough APPROVED hours accumulate — receives
// a certificate. All timestamps are ISO-8601 UTC (Colombia local time is a
// presentation concern only). Hours are fractional (e.g. 2.5) — not money, so
// the integer-COP convention does not apply here.

// `Paginated<T>` is already published (from `campaigns.ts`) and re-exported
// through the package barrel — consumers import it from `@adoptafacil/contracts`
// as usual; it is not redeclared here (a second declaration would collide at
// the barrel's `export *`, same reason `sponsorships.ts`/`org.ts` don't either).

// ============================================================================
// Volunteer opportunities (RF18)
// ============================================================================

/**
 * Lifecycle of an opportunity — CLOSED for now. `active` is the only state the
 * public listing ever shows. TODO(client): a richer lifecycle (draft, full)
 * is not defined by the base document; adding a value later is additive.
 */
export enum VolunteerOpportunityStatus {
  Active = 'active',
  Closed = 'closed',
}

export interface VolunteerOpportunity {
  id: string;
  organizationId: string;
  title: string;
  description?: string;
  category: string;
  /** ISO-8601 UTC. */
  startDate: string;
  /** ISO-8601 UTC. */
  endDate: string;
  /** Cupo — max enrollments. `undefined` = no cap. */
  capacity?: number;
  location: string;
  requirements?: string;
  /** Whether this opportunity counts toward the mandatory student social
   *  service (RF19, Resolución 4210/1996 art. 6°) — set by the organization
   *  when publishing. Snapshotted onto each `VolunteerEnrollment` at signup
   *  time, so a later edit here never reclassifies an existing enrollment. */
  appliesToStudentService: boolean;
  status: VolunteerOpportunityStatus;
  /** ISO-8601 UTC. */
  createdAt: string;
}

/** Public projection (portal, no session) — same fields, no internal id beyond
 *  the opportunity's own, plus the owning org's display name. */
export interface VolunteerOpportunityPublic {
  id: string;
  organizationId: string;
  organizationName: string;
  title: string;
  description?: string;
  category: string;
  startDate: string;
  endDate: string;
  capacity?: number;
  location: string;
  requirements?: string;
  appliesToStudentService: boolean;
}

export interface CreateVolunteerOpportunityInput {
  title: string;
  description?: string;
  category: string;
  /** ISO-8601 UTC. */
  startDate: string;
  /** ISO-8601 UTC. */
  endDate: string;
  capacity?: number;
  location: string;
  requirements?: string;
  appliesToStudentService?: boolean;
}

/** Patch an opportunity. All fields optional; only provided fields change. */
export interface UpdateVolunteerOpportunityInput {
  title?: string;
  description?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
  capacity?: number;
  location?: string;
  requirements?: string;
  status?: VolunteerOpportunityStatus;
}

// ============================================================================
// Enrollment (RF18) — a Person subscribes to an opportunity, cross-tenant
// (same technique as M07 sponsorships: the volunteer is never a member of the
// opportunity's organization).
// ============================================================================

/**
 * pending → accepted | rejected (organization decision); accepted → completed
 * (organization marks the engagement as finished). Terminal: rejected,
 * completed. Do NOT invent states outside RF18.
 */
export enum VolunteerEnrollmentStatus {
  Pending = 'pending',
  Accepted = 'accepted',
  Rejected = 'rejected',
  Completed = 'completed',
}

export interface VolunteerEnrollment {
  id: string;
  organizationId: string;
  opportunityId: string;
  volunteerUserId: string;
  /** Snapshotted from `users` at enrollment time — the organization needs a
   *  name/contact to review who is applying (the volunteer is never one of
   *  its members, so a live join isn't possible without a cross-tenant
   *  lookup); same rationale as `AdoptionRequest.applicant`. */
  volunteerName: string;
  volunteerEmail: string;
  /** Snapshotted from the opportunity at enrollment time (see
   *  {@link VolunteerOpportunity.appliesToStudentService}). */
  appliesToStudentService: boolean;
  status: VolunteerEnrollmentStatus;
  /** Required when `status === 'rejected'`. */
  rejectionReason?: string;
  decidedByUserId?: string;
  /** ISO-8601 UTC. */
  decidedAt?: string;
  /** ISO-8601 UTC. */
  createdAt: string;
}

/** "Mis inscripciones" projection (cross-tenant, by identity) — enriched with
 *  names a volunteer needs to recognize their own enrollment, resolved
 *  server-side (never trusted from the client). */
export interface VolunteerEnrollmentMine extends VolunteerEnrollment {
  organizationName: string;
  opportunityTitle: string;
}

/** Enroll in an opportunity — any authenticated Person. */
export interface CreateVolunteerEnrollmentInput {
  opportunityId: string;
}

/** Owner/Administrator decision on a pending enrollment. `reason` is REQUIRED
 *  for `reject` (the API rejects with 400 otherwise) — same criterion as the
 *  platform document review queue. */
export type VolunteerEnrollmentDecision = 'accept' | 'reject';

export interface DecideVolunteerEnrollmentInput {
  decision: VolunteerEnrollmentDecision;
  reason?: string;
}

// ============================================================================
// Service hours (RF18/RF19) — logged by the volunteer against their OWN
// accepted enrollment; only APPROVED hours ever count as "horas efectivas".
// ============================================================================

export type ServiceHoursStatus = 'pending' | 'approved' | 'rejected';

export interface ServiceHours {
  id: string;
  organizationId: string;
  enrollmentId: string;
  volunteerUserId: string;
  /** ISO-8601 UTC — the date the session took place. */
  date: string;
  /** Fractional hours (e.g. 2.5), > 0. */
  hours: number;
  description: string;
  status: ServiceHoursStatus;
  /** Required when `status === 'rejected'`. */
  rejectionReason?: string;
  decidedByUserId?: string;
  /** ISO-8601 UTC. */
  decidedAt?: string;
  /** ISO-8601 UTC. */
  createdAt: string;
}

export interface LogServiceHoursInput {
  enrollmentId: string;
  /** ISO-8601 UTC. */
  date: string;
  /** Fractional hours, > 0. */
  hours: number;
  description: string;
}

export type ServiceHoursDecision = 'approve' | 'reject';

export interface DecideServiceHoursInput {
  decision: ServiceHoursDecision;
  reason?: string;
}

// ============================================================================
// Certificate (RF18/RF19) — issued explicitly by the organization for ONE
// enrollment, reflecting ONLY approved hours. Never auto-issued: the base
// document does not define a trigger for automatic issuance, and RF19's "no
// se certifican horas parciales" invariant means the org must consciously
// close the books on that enrollment's hours before issuing.
// ============================================================================

/**
 * Minimum effective hours for the student social service certificate (RF19,
 * Resolución 4210/1996 art. 6°). The base document fixes 80h as the legal
 * default, but a specific school/organization agreement could differ —
 * TODO(client): expose this as a per-organization override if that need
 * materializes; today it is a single server-side configurable default (see
 * `apps/api/src/modules/volunteering/student-service-hours.ts`), not a value
 * baked into this contract.
 */
export const DEFAULT_STUDENT_SERVICE_MIN_HOURS = 80;

export interface VolunteerCertificate {
  id: string;
  organizationId: string;
  enrollmentId: string;
  volunteerUserId: string;
  /** Snapshotted at issuance — never affected by a later name change. */
  volunteerName: string;
  organizationName: string;
  opportunityTitle: string;
  /** Sum of APPROVED hours at issuance time — never includes pending/rejected. */
  totalApprovedHours: number;
  /** ISO-8601 UTC — the opportunity's own date range. */
  periodStart: string;
  /** ISO-8601 UTC. */
  periodEnd: string;
  appliesToStudentService: boolean;
  issuedByUserId: string;
  /** ISO-8601 UTC. */
  issuedAt: string;
}

// Module: M07 sponsorships · Contracts owner: @sebastian
//
// Recurring animal sponsorships (RF17, §9/§14). BASE slice (T-056): an
// organization defines sponsorship PLANS for its animals; a sponsor (Person,
// "padrino") subscribes to a plan; the organization suspends/reactivates/cancels
// and sees the history. Money is INTEGER COP pesos (never float). This slice does
// NOT process any payment — TODO(T-057): connect Sponsorship to PAYMENT_PORT for
// real recurring charges and publish SponsorshipPayment. All timestamps are
// ISO-8601 UTC (Colombia local time is a presentation concern only).

/**
 * Billing cadence of a plan — CLOSED for now (`monthly`, the base document's
 * wording). TODO(client): extend if other cadences are requested; adding a value
 * is additive and does not break existing consumers.
 */
export enum SponsorshipPeriodicity {
  Monthly = 'monthly',
}

/** Allowed periodicities, exported for validation and UI dropdowns. */
export const SPONSORSHIP_PERIODICITIES: readonly SponsorshipPeriodicity[] = [
  SponsorshipPeriodicity.Monthly,
];

/**
 * Lifecycle of a sponsorship (RF17). Valid transitions: active↔suspended
 * (suspend/reactivate) and either →cancelled (terminal; no reactivation from
 * cancelled). Do NOT invent states outside RF17.
 */
export enum SponsorshipStatus {
  Active = 'active',
  Suspended = 'suspended',
  Cancelled = 'cancelled',
}

/**
 * A recurring-sponsorship plan an organization defines for one of its animals.
 * `amount` is the recurring INTEGER COP charge per `periodicity` cycle (> 0).
 * `isActive=false` = archived (no longer offered; existing sponsorships on it are
 * unaffected).
 */
export interface SponsorshipPlan {
  id: string;
  organizationId: string;
  animalId: string;
  name: string;
  /** Integer COP pesos, > 0, per billing cycle. */
  amount: number;
  periodicity: SponsorshipPeriodicity;
  isActive: boolean;
  /** ISO-8601 UTC. */
  createdAt: string;
}

/** Create a sponsorship plan (Owner/Administrator) for one of the org's animals. */
export interface CreateSponsorshipPlanInput {
  animalId: string;
  name: string;
  /** Integer COP pesos, > 0. */
  amount: number;
  periodicity: SponsorshipPeriodicity;
}

/** Patch a plan. All fields optional; `isActive:false` archives it. */
export interface UpdateSponsorshipPlanInput {
  name?: string;
  amount?: number;
  periodicity?: SponsorshipPeriodicity;
  isActive?: boolean;
}

/**
 * A sponsor's (padrino) subscription to a plan. `animalId` is denormalized from
 * the plan (§14 model) so consumers don't need a join. `sponsorUserId` is the
 * Person who subscribed — never exposed publicly (see {@link SponsorshipPublicSummary}).
 */
export interface Sponsorship {
  id: string;
  organizationId: string;
  /**
   * Nombre visible de la organización patrocinada. Opcional y aditivo: solo
   * `GET /sponsorships/mine` lo resuelve (S2-03, bandeja "mis apadrinamientos"
   * del padrino, que no conoce el nombre por fuera de este id); el resto de
   * rutas lo dejan `undefined`.
   */
  organizationName?: string;
  planId: string;
  /** Nombre del plan al momento de la consulta. Igual que `organizationName`: solo `mine`. */
  planName?: string;
  /** Monto recurrente del plan (COP enteros). Solo `mine`. */
  planAmount?: number;
  /** Periodicidad del plan. Solo `mine`. */
  planPeriodicity?: SponsorshipPeriodicity;
  animalId: string;
  /** Nombre del animal apadrinado. Solo `mine`. */
  animalName?: string;
  sponsorUserId: string;
  status: SponsorshipStatus;
  /** ISO-8601 UTC. */
  startedAt: string;
  /** ISO-8601 UTC, set when suspended. */
  suspendedAt?: string;
  /** ISO-8601 UTC, set when cancelled (terminal). */
  cancelledAt?: string;
  /** ISO-8601 UTC. */
  createdAt: string;
}

/** Subscribe to a plan (authenticated Person = the padrino). */
export interface CreateSponsorshipInput {
  planId: string;
}

/**
 * One entry of a sponsorship's immutable status history (RF17 "historial").
 * `fromStatus` is absent on the entry created at subscription time. `reason` is
 * free-text, optional (e.g. staff may record why a suspension happened); no
 * closed reason-code enum is imposed here.
 */
export interface SponsorshipStatusHistoryEntry {
  id: string;
  sponsorshipId: string;
  fromStatus?: SponsorshipStatus;
  toStatus: SponsorshipStatus;
  actorUserId?: string;
  reason?: string;
  /** ISO-8601 UTC. */
  createdAt: string;
}

/** Optional reason accompanying a suspend/cancel action (never required). */
export interface SponsorshipStatusChangeInput {
  reason?: string;
}

// ============================================================================
// Public (portal) projections — additive, NO sponsor PII. Lets Fabián's portal
// show "this animal has N active sponsors" and the plans available to sponsor it,
// without a session and without leaking who the sponsors are.
// ============================================================================

/** Public projection of a plan — no organization-internal fields beyond what a
 *  donor/sponsor needs to choose it. */
export interface SponsorshipPlanPublic {
  id: string;
  animalId: string;
  name: string;
  amount: number;
  periodicity: SponsorshipPeriodicity;
}

/** Public summary for one animal: active plans + how many active sponsors it has
 *  (a count only — never sponsor identities). */
export interface SponsorshipPublicSummary {
  animalId: string;
  activePlans: SponsorshipPlanPublic[];
  activeSponsorCount: number;
}

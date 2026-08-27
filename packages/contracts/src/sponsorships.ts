// Module: M07 sponsorships · Contracts owner: @sebastian
//
// Recurring animal sponsorships (RF17, §9/§14). BASE slice (T-056): an
// organization defines sponsorship PLANS for its animals; a sponsor (Person,
// "padrino") subscribes to a plan; the organization suspends/reactivates/cancels
// and sees the history. Money is INTEGER COP pesos (never float). All timestamps
// are ISO-8601 UTC (Colombia local time is a presentation concern only).
//
// S-5-REDISEÑO (incluye T-057) — replaces the original S-5 design (automatic
// debit does not exist; Wompi only exposes one-shot payment links). Adds
// `SponsorshipPayment`/`SponsorshipPaymentAttempt`: a per-billing-period ledger
// driven by the FIRST real cron job in this project (daily BullMQ scan), with a
// tolerant reminder/retry ladder (up to 3 payment-link attempts) before
// auto-suspension. Payment confirmation is via POLLING
// `PaymentPort.getCollectionStatus()`, not the gateway webhook (that webhook is
// hardcoded inside donations/**, Fabián's domain — extending it was out of
// scope here, confirmed with the user 2026-08-24).

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
  /**
   * Nombre del padrino, capturado como SNAPSHOT al momento de apadrinar (mismo
   * criterio que `DonationDonor` en donations: el padrino no es miembro de esta
   * organización, así que no hay join en vivo posible sin una función
   * cross-tenant). A diferencia de `organizationName`/`planName`/`animalName`
   * (que solo resuelve `GET /sponsorships/mine`), este campo es una COLUMNA
   * real y viene poblado en TODAS las rutas, incluida la vista interna de la
   * organización (`GET /sponsorships`). `undefined` en apadrinamientos creados
   * antes de este campo (T-057, nunca se rellena retroactivamente) y en
   * `GET /sponsorships/mine` (el propio padrino no necesita ver su nombre).
   */
  sponsorName?: string;
  status: SponsorshipStatus;
  /** ISO-8601 UTC. */
  startedAt: string;
  /** ISO-8601 UTC, set when suspended. */
  suspendedAt?: string;
  /** ISO-8601 UTC, set when cancelled (terminal). */
  cancelledAt?: string;
  /**
   * Status of the CURRENT billing period (S-5-REDISEÑO) — lets "Mis
   * apadrinamientos" and the org management view show "pago pendiente / en
   * riesgo" throughout the reminder/retry ladder, not only at the moment of
   * final suspension (Objetivo 7). `undefined` when no period has been opened
   * yet (e.g. a brand-new sponsorship before the daily job's first pass).
   * Populated only by `list`/`get`/`listMine` (same "enrichment, not a real
   * column" convention as `organizationName`/`planName` above).
   */
  currentPeriodStatus?: SponsorshipPaymentStatus;
  /** How many payment-link attempts the current period has used (0-3). Only
   *  present alongside {@link currentPeriodStatus}. */
  currentPeriodAttemptCount?: number;
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
// S-5-REDISEÑO (M07, RF17, incluye T-057) — recurring billing ledger. One
// `SponsorshipPayment` per (sponsorshipId, period); one `SponsorshipPaymentAttempt`
// per payment LINK generated within that period (never a retry of the same
// link — a new attempt is always a new `PaymentPort.createCollection()` call).
// ============================================================================

/**
 * Lifecycle of one billing period. `paid`/`failed` are normally terminal —
 * the ONE exception: `failed` -> `paid` when the sponsor recovers a
 * billing-failure suspension by paying a new, sponsor-initiated link
 * (Objetivo 6, "recuperación") against that same historical period.
 */
export enum SponsorshipPaymentStatus {
  Pending = 'pending',
  Paid = 'paid',
  Failed = 'failed',
}

/** Outcome of one payment-link attempt. Terminal once `paid` or `expired` —
 *  an expired attempt is never reused; the next attempt is a brand-new link. */
export enum SponsorshipPaymentAttemptResult {
  Pending = 'pending',
  Paid = 'paid',
  Expired = 'expired',
}

/**
 * One payment link generated for one period. `collectionId` is
 * `PaymentPort`'s own id (confirmed by polling `getCollectionStatus`, see the
 * file header). `paymentLinkUrl` is OPTIONAL: `PaymentPort.CollectionResult`
 * does not expose a checkout URL today — TODO(client): populate this once
 * that contract gains one additively (Fabián's domain; not changed here).
 */
export interface SponsorshipPaymentAttempt {
  id: string;
  sponsorshipPaymentId: string;
  attemptNumber: number;
  collectionId: string;
  paymentLinkUrl?: string;
  /** ISO-8601 UTC — when this specific link stops being honored (a NEW
   *  attempt is generated after this, never a retry of this same link). */
  expiresAt: string;
  result: SponsorshipPaymentAttemptResult;
  /** ISO-8601 UTC. */
  createdAt: string;
}

/**
 * One billing period (`period` = `YYYY-MM`) of a sponsorship. `attempts` is
 * the full ledger of links generated for it (1 to 3, oldest first).
 */
export interface SponsorshipPayment {
  id: string;
  sponsorshipId: string;
  organizationId: string;
  period: string;
  status: SponsorshipPaymentStatus;
  attempts: SponsorshipPaymentAttempt[];
  /** ISO-8601 UTC. */
  createdAt: string;
}

/**
 * The exact free-text reason recorded on `SponsorshipStatusHistory` when the
 * DAILY BILLING JOB auto-suspends a sponsorship after 3 failed attempts —
 * distinguishes an automatic (billing-failure) suspension from a manual one
 * by the organization, since RF17 does not add a new status value or a
 * dedicated reason column for this (the existing free-text `reason` field is
 * "deliberately generic", per its own doc comment). Compared by exact string
 * equality wherever this distinction matters (auto-reactivation eligibility).
 */
export const BILLING_FAILURE_SUSPENSION_REASON =
  'Pago fallido: se agotaron los 3 intentos de cobro.';

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

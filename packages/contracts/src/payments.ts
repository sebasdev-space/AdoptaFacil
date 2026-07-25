// Module: M15 payments · Contracts owner: @fabian
//
// PaymentPort (contract-first, Ola 2, T-040). Publishes ONLY the contract that the
// money engine exposes so the consumers (M06 campaigns, M07 sponsorships, M05
// donations, …) can build against a stable, simulable surface WITHOUT waiting for
// the real Wompi adapter (that is M15 implementation, a later task).
//
// CLOSED decisions reflected here (do NOT reopen):
//   - Gateway: Wompi. Consolidated collection + T+1 payout. NO split at checkout —
//     the port never models a split; `breakdown` is informational/accounting only.
//   - Platform commission 4% on gross; gateway commission 2.65% + 700 (fixed);
//     IVA 19% ONLY over commissions; no custody of third-party balances; COP.
//   - SARLAFT/KYC (RF28) is validated in M15 BEFORE createPayout — NOT by the port.
//
// This file is TYPES + a PURE breakdown function + a deterministic FAKE adapter
// (dev/test double, dependency-free, browser-safe). The DI token (PAYMENT_PORT),
// @Global module and binding live in core/ and are Sebastián's task — NOT here.
// Money is ALWAYS integer COP pesos (never float). RNF12: the breakdown is
// auditable and reconciles to the peso.

/** Only currency in Ola 1. */
export type PaymentCurrency = 'COP';

/** Lifecycle of a collection (recaudo). */
export type PaymentStatus = 'pending' | 'approved' | 'declined' | 'voided' | 'error';

/** Lifecycle of a payout (dispersión T+1). */
export type PayoutStatus = 'scheduled' | 'paid' | 'failed';

/** Who bears the commissions — the client's "cubro la comisión" checkbox (P1). */
export type CommissionPayer = 'organization' | 'donor';

/** What the money is FOR (drives beneficiary/accounting; not a checkout split). */
export type PaymentConceptKind = 'organization' | 'animal' | 'campaign';

export interface PaymentConcept {
  kind: PaymentConceptKind;
  /** Id of the org/animal/campaign this collection is attributed to. */
  id: string;
}

/** Minimal payer contact (Ley 1581: personal data — never logged in clear). */
export interface PaymentPayer {
  fullName?: string;
  email?: string;
  /** National id / NIT if provided (SARLAFT context; handled by M15, not the port). */
  documentId?: string;
}

/**
 * Itemized, auditable breakdown (RNF12). All amounts are integer COP pesos.
 * INVARIANT (holds to the peso, both modes):
 *   gross === net + platformFee + platformIva + gatewayFee + gatewayIva
 * `amountCharged` is what the payer's instrument is charged; in Ola 1 (no split,
 * no tips) it equals `gross`.
 */
export interface PaymentBreakdown {
  amountCharged: number;
  gross: number;
  platformFee: number;
  platformIva: number;
  gatewayFee: number;
  gatewayIva: number;
  net: number;
}

export interface CreateCollectionInput {
  /** Integer COP pesos that must REACH the beneficiary (net target). */
  intendedAmount: number;
  currency: PaymentCurrency;
  concept: PaymentConcept;
  commissionPayer: CommissionPayer;
  payer?: PaymentPayer;
  /** Caller-supplied key: a retry with the same key must NOT double-charge. */
  idempotencyKey: string;
}

export interface CollectionResult {
  collectionId: string;
  status: PaymentStatus;
  breakdown: PaymentBreakdown;
}

/** Normalized, idempotent webhook event (dedup by `dedupKey`). */
export interface NormalizedWebhookEvent {
  eventId: string;
  collectionId: string;
  status: PaymentStatus;
  /** Stable key to dedup repeated deliveries of the same event. */
  dedupKey: string;
}

export interface CreatePayoutInput {
  beneficiaryOrgId: string;
  /** Integer COP pesos to disperse (T+1). */
  amount: number;
  /** Caller-supplied key: a retry with the same key must NOT double-pay. */
  idempotencyKey: string;
}

export interface PayoutResult {
  payoutId: string;
  status: PayoutStatus;
}

/**
 * The money-engine port (hexagonal). Ola 1 binds a simulable adapter; the real
 * Wompi adapter arrives behind this SAME interface (M15/Ola 2 implementation).
 * Idempotency, retries and reconciliation live in M15; the port only exposes the
 * operations (and accepts the idempotency key).
 */
export interface PaymentPort {
  /** Start a collection (checkout). Returns the auditable breakdown. */
  createCollection(input: CreateCollectionInput): Promise<CollectionResult>;
  /** Current status of a collection. */
  getCollectionStatus(collectionId: string): Promise<PaymentStatus>;
  /** Verify a gateway webhook signature and normalize it to a dedup-able event. */
  verifyAndNormalizeWebhook(payload: unknown, signature: string): NormalizedWebhookEvent;
  /** Schedule a payout (T+1). SARLAFT/KYC is checked in M15 before calling this. */
  createPayout(input: CreatePayoutInput): Promise<PayoutResult>;
}

// ============================================================================
// Pure breakdown (RNF12) — the SINGLE source of the commission math, reusable by
// the port, the checkout UI and the transparency surface (misma cuenta).
// ============================================================================

/** Commission configuration (COP). Exposed so UIs can show the same figures. */
export const PAYMENT_FEE_CONFIG = {
  /** Platform commission over gross. */
  platformRate: 0.04,
  /** Gateway proportional commission over gross. */
  gatewayRate: 0.0265,
  /** Gateway fixed commission (pesos). */
  gatewayFixed: 700,
  /** VAT applied ONLY over commissions. */
  ivaRate: 0.19,
} as const;

/** Round to integer pesos, HALF-UP (positive amounts only). */
export function roundPesosHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

/** Commission components computed from a gross amount (each rounded to the peso). */
function feesFromGross(gross: number): Omit<PaymentBreakdown, 'amountCharged' | 'gross' | 'net'> {
  const { platformRate, gatewayRate, gatewayFixed, ivaRate } = PAYMENT_FEE_CONFIG;
  const platformFee = roundPesosHalfUp(platformRate * gross);
  const platformIva = roundPesosHalfUp(ivaRate * platformFee);
  const gatewayFee = roundPesosHalfUp(gatewayRate * gross + gatewayFixed);
  const gatewayIva = roundPesosHalfUp(ivaRate * gatewayFee);
  return { platformFee, platformIva, gatewayFee, gatewayIva };
}

/**
 * Compute the auditable breakdown for a collection.
 *
 * - `organization`: the org absorbs the commissions. `amountCharged = gross =
 *   intendedAmount`; `net < intendedAmount`.
 * - `donor`: the donor covers the commissions (checkbox P1). The gross is grossed
 *   UP so `net ≈ intendedAmount`; `amountCharged = gross > intendedAmount`.
 *
 * `net` is always the remainder (`gross − Σ commissions`), so the sum invariant
 * holds to the peso by construction in BOTH modes.
 *
 * @param intendedAmount integer COP pesos that should reach the beneficiary (> 0).
 */
export function computeBreakdown(
  intendedAmount: number,
  commissionPayer: CommissionPayer,
): PaymentBreakdown {
  if (!Number.isInteger(intendedAmount) || intendedAmount <= 0) {
    throw new RangeError('intendedAmount must be a positive integer number of COP pesos');
  }

  const { platformRate, gatewayRate, gatewayFixed, ivaRate } = PAYMENT_FEE_CONFIG;

  let gross: number;
  if (commissionPayer === 'organization') {
    gross = intendedAmount;
  } else {
    // Solve net(gross) = gross·(1 − r) − F = intendedAmount for gross, then round.
    //   r = proportional commissions incl. their IVA
    //   F = fixed gateway fee incl. its IVA
    const proportional =
      platformRate + platformRate * ivaRate + gatewayRate + gatewayRate * ivaRate;
    const fixed = gatewayFixed + gatewayFixed * ivaRate;
    gross = roundPesosHalfUp((intendedAmount + fixed) / (1 - proportional));
  }

  const fees = feesFromGross(gross);
  const net = gross - fees.platformFee - fees.platformIva - fees.gatewayFee - fees.gatewayIva;

  return { amountCharged: gross, gross, ...fees, net };
}

// ============================================================================
// FakePaymentAdapter — deterministic, dependency-free, browser-safe test double.
// Ola 1 dev/test only. The REAL Wompi adapter is M15 implementation. If the daily
// decides the fake lives in core/ with the other stubs, this can move there
// unchanged — it depends only on this file's types + computeBreakdown.
// ============================================================================

/** Dependency-free deterministic string hash (djb2) → positive hex; no node/crypto. */
function stableHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  // >>> 0 makes it an unsigned 32-bit int, stable across runs and environments.
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Shape a fake webhook payload is expected to carry (all optional/best-effort). */
interface FakeWebhookPayload {
  collectionId?: string;
  status?: PaymentStatus;
  eventId?: string;
}

/**
 * Deterministic {@link PaymentPort} for development and tests: no network, no
 * randomness, no clock. The same `idempotencyKey` always yields the same ids and
 * result (ids are DERIVED from the key, so no state is needed). Collections settle
 * as `approved`, payouts as `scheduled`.
 */
export class FakePaymentAdapter implements PaymentPort {
  static readonly PROVIDER = 'fake-local';

  async createCollection(input: CreateCollectionInput): Promise<CollectionResult> {
    return {
      collectionId: `fake-col-${stableHash(input.idempotencyKey)}`,
      status: 'approved',
      breakdown: computeBreakdown(input.intendedAmount, input.commissionPayer),
    };
  }

  async getCollectionStatus(_collectionId: string): Promise<PaymentStatus> {
    return 'approved';
  }

  verifyAndNormalizeWebhook(payload: unknown, _signature: string): NormalizedWebhookEvent {
    const body = (payload ?? {}) as FakeWebhookPayload;
    const collectionId = body.collectionId ?? 'fake-col-unknown';
    const eventId = body.eventId ?? `fake-evt-${stableHash(collectionId)}`;
    return {
      eventId,
      collectionId,
      status: body.status ?? 'approved',
      dedupKey: eventId,
    };
  }

  async createPayout(input: CreatePayoutInput): Promise<PayoutResult> {
    return {
      payoutId: `fake-pay-${stableHash(input.idempotencyKey)}`,
      status: 'scheduled',
    };
  }
}

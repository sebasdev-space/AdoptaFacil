import {
  ResourceDeliveryStatus,
  ResourceNeedStatus,
  ResourceOfferStatus,
} from '@adoptafacil/contracts';

/**
 * Pure helpers for M09 (banco de recursos) — no DB, no I/O, so the
 * fulfillment math and lifecycle rules are unit tested in isolation, same
 * pattern as `campaign-progress.ts`/`campaign-accountability.ts`.
 */

/** Derived progress toward a need, acotado a [0, 1] (never stored). */
export function computeFulfillmentProgress(
  quantityFulfilled: number,
  quantityNeeded: number,
): number {
  if (quantityNeeded <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, quantityFulfilled / quantityNeeded));
}

/**
 * The need's status DERIVED from its fulfilled/needed quantities — never set
 * directly by the client except the one manual transition to `cancelled`
 * (handled separately, in the update DTO). `cancelled` is sticky: once
 * cancelled, completing a stray delivery never revives it.
 */
export function deriveNeedStatus(
  quantityFulfilled: number,
  quantityNeeded: number,
  currentStatus: ResourceNeedStatus,
): ResourceNeedStatus {
  if (currentStatus === ResourceNeedStatus.Cancelled) {
    return ResourceNeedStatus.Cancelled;
  }
  if (quantityFulfilled >= quantityNeeded) {
    return ResourceNeedStatus.Fulfilled;
  }
  if (quantityFulfilled > 0) {
    return ResourceNeedStatus.PartiallyFulfilled;
  }
  return ResourceNeedStatus.Needed;
}

/** Only a need still accepting help ('needed'/'partially_fulfilled') may
 *  receive a NEW offer — mirrors the SQL guard in `create_resource_offer`. */
export function needAcceptsOffers(status: ResourceNeedStatus): boolean {
  return status === ResourceNeedStatus.Needed || status === ResourceNeedStatus.PartiallyFulfilled;
}

/** Only an `offered` offer can be accepted/declined/cancelled — every other
 *  status is terminal. */
export function canDecideOffer(status: ResourceOfferStatus): boolean {
  return status === ResourceOfferStatus.Offered;
}

/** Legal delivery transitions: `scheduled` → `completed` | `cancelled`.
 *  `completed`/`cancelled` are terminal — no further transition is legal,
 *  including a repeat of the same one (the caller must treat that as a
 *  conflict, not a silent no-op, unlike the webhook-driven flows elsewhere). */
export function canTransitionDelivery(
  from: ResourceDeliveryStatus,
  _to: ResourceDeliveryStatus.Completed | ResourceDeliveryStatus.Cancelled,
): boolean {
  return from === ResourceDeliveryStatus.Scheduled;
}

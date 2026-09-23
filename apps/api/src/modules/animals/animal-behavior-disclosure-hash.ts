import { createHash } from 'node:crypto';
import type { ChildrenCompatibility } from '@adoptafacil/contracts';

/** The exact fields sealed by {@link computeDisclosureHash} — everything a
 *  reader would need to verify nothing was altered after signing. */
export interface DisclosureHashPayload {
  animalId: string;
  signedByName: string;
  reactivityNotes: string | null;
  biteHistory: boolean;
  biteHistoryDetail: string | null;
  childrenCompatibility: ChildrenCompatibility;
  medicalConditionsRelevant: string | null;
  declaredByUserId: string;
}

/**
 * Canonical (sorted-key) JSON string of the payload — same technique as
 * `adoption-contract-hash.ts` (M04), replicated here rather than imported: no
 * cross-module dependency, and the payload shapes are unrelated.
 */
function canonicalString(payload: DisclosureHashPayload): string {
  const sorted = Object.keys(payload)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = payload[key as keyof DisclosureHashPayload];
      return acc;
    }, {});
  return JSON.stringify(sorted);
}

/**
 * SHA-256 (hex) seal of the canonical disclosure content — computed
 * server-side at signature time (FSD v3.5 Doc 4). The row is append-only, so
 * this hash is never recomputed after insert; it exists so a later reader can
 * independently verify the content matches what was signed.
 */
export function computeDisclosureHash(payload: DisclosureHashPayload): string {
  return createHash('sha256').update(canonicalString(payload), 'utf8').digest('hex');
}

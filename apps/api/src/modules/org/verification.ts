import {
  DocumentStatus,
  DocumentType,
  FORMALIZATION_SEQUENCE,
  FormalizationState,
  type VerificationLevel,
} from '@adoptafacil/contracts';

/**
 * Verification levels (M01, §14). A level is "met" iff ALL of its required
 * document types are Approved AND currently valid (vigente), AND (when set) the
 * org's formalization state is at or past `minFormalizationState`. The
 * verification level of an org is the highest CONTIGUOUS tier whose
 * requirements are met — a single expired/missing required document, or a
 * formalization state below the tier's floor, blocks that tier (subsanación:
 * uploading a new, current, approved version, or advancing formalization,
 * unblocks it).
 *
 * The MECHANISM (this file) is fully wired. The CATALOG — how many tiers, their
 * labels, and which requirements each has — is a business decision the base
 * document does NOT fix (§9/§10).
 *
 * TODO(client): `VERIFICATION_LEVELS` below is an INITIAL DEFAULT ladder (S1-05),
 * not a client-confirmed one — chosen from what the system already models
 * (documents + formalization state) so the portal badge shows something real
 * instead of sitting at 0 forever. The client can redefine tier count, labels,
 * or requirements later by editing ONLY this array — `computeVerificationLevel`
 * reads the catalog generically and never hardcodes a tier's meaning.
 */
export interface LevelRequirement {
  /** Numeric tier (>= 1), higher = more verified. */
  level: number;
  /** Human-readable label of the tier. */
  label: string;
  /** Document types that must be Approved AND current to reach this tier. */
  requiredDocuments: DocumentType[];
  /**
   * Minimum formalization state required to reach this tier (inclusive,
   * ordered by {@link FORMALIZATION_SEQUENCE}). Omit for tiers gated by
   * documents only.
   */
  minFormalizationState?: FormalizationState;
}

export const VERIFICATION_LEVELS: readonly LevelRequirement[] = [
  // TODO(client): initial default ladder (S1-05) — redefine freely, no code change needed.
  { level: 1, label: 'Básico', requiredDocuments: [DocumentType.Rut] },
  {
    level: 2,
    label: 'Verificado',
    requiredDocuments: [DocumentType.Rut, DocumentType.ExistenceRepresentationCertificate],
  },
  {
    level: 3,
    label: 'Confiable',
    requiredDocuments: [DocumentType.Rut, DocumentType.ExistenceRepresentationCertificate],
    minFormalizationState: FormalizationState.Formalizada,
  },
  {
    level: 4,
    label: 'Máxima confianza',
    requiredDocuments: [DocumentType.Rut, DocumentType.ExistenceRepresentationCertificate],
    // ESAL_RTE *is* "ESAL con RTE vigente" in this system's own state machine
    // (see FormalizationState/rteVigenteFor) — no separate rteVigente check needed.
    minFormalizationState: FormalizationState.ESAL_RTE,
  },
];

/** Minimal snapshot of a document needed to compute verification (pure). */
export interface DocumentSnapshot {
  type: DocumentType;
  /** STORED status (not yet expiry-adjusted). */
  status: DocumentStatus;
  /** Expiry instant, or null if the document does not expire. */
  expiresAt: Date | null;
}

/**
 * Effective status of a document, accounting for expiry: an Approved document
 * whose `expiresAt` is strictly in the past is Expired. Everything else keeps
 * its stored status. Expiry is evaluated here at read time — never stored.
 */
export function effectiveStatus(
  status: DocumentStatus,
  expiresAt: Date | null,
  now: Date,
): DocumentStatus {
  if (status === DocumentStatus.Approved && expiresAt && expiresAt.getTime() < now.getTime()) {
    return DocumentStatus.Expired;
  }
  return status;
}

/** The set of document types that are Approved AND currently valid (vigente). */
export function satisfiedDocumentTypes(
  documents: readonly DocumentSnapshot[],
  now: Date,
): Set<DocumentType> {
  const satisfied = new Set<DocumentType>();
  for (const doc of documents) {
    if (effectiveStatus(doc.status, doc.expiresAt, now) === DocumentStatus.Approved) {
      satisfied.add(doc.type);
    }
  }
  return satisfied;
}

/** Is `state` at or past `min` in {@link FORMALIZATION_SEQUENCE}? */
function meetsFormalization(state: FormalizationState, min: FormalizationState): boolean {
  return FORMALIZATION_SEQUENCE.indexOf(state) >= FORMALIZATION_SEQUENCE.indexOf(min);
}

/**
 * Compute the verification level from the org's documents AND formalization
 * state. Advances through the (ordered) ladder while each tier's requirements
 * — required documents AND, when set, `minFormalizationState` — are all
 * satisfied; stops at the first unmet tier and reports what blocks it.
 */
export function computeVerificationLevel(
  documents: readonly DocumentSnapshot[],
  formalizationState: FormalizationState,
  levels: readonly LevelRequirement[],
  now: Date,
): VerificationLevel {
  const satisfied = satisfiedDocumentTypes(documents, now);
  const ladder = [...levels].sort((a, b) => a.level - b.level);

  const criteria: string[] = [];
  let achievedLevel = 0;
  let label: string | undefined;

  for (const tier of ladder) {
    const missingDocuments = tier.requiredDocuments.filter((type) => !satisfied.has(type));
    const missingFormalization =
      tier.minFormalizationState &&
      !meetsFormalization(formalizationState, tier.minFormalizationState)
        ? [`formalization:${tier.minFormalizationState}`]
        : [];
    const missing = [...missingDocuments, ...missingFormalization];
    if (missing.length > 0) {
      // First unmet tier: this is what the org is blocked on.
      return {
        level: achievedLevel,
        label,
        criteria: [...new Set(criteria)],
        nextLevel: tier.level,
        blockedBy: missing,
      };
    }
    achievedLevel = tier.level;
    label = tier.label;
    criteria.push(...tier.requiredDocuments.map((type) => `${type}:approved`));
    if (tier.minFormalizationState) {
      criteria.push(`formalization:${tier.minFormalizationState}`);
    }
  }

  // Reached the top of the configured ladder (or the ladder is empty). Dedupe:
  // consecutive tiers commonly repeat the same required document (S1-05).
  return { level: achievedLevel, label, criteria: [...new Set(criteria)] };
}

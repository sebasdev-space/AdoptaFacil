import { DocumentStatus, DocumentType, type VerificationLevel } from '@adoptafacil/contracts';

/**
 * Verification levels (M01, §14). A level is "met" iff ALL of its required
 * document types are Approved AND currently valid (vigente). The verification
 * level of an org is the highest CONTIGUOUS tier whose requirements are met — a
 * single expired/missing required document blocks that tier (subsanación:
 * uploading a new, current, approved version unblocks it).
 *
 * The MECHANISM (this file) is fully wired. The CATALOG — how many tiers, their
 * labels, and which document types each requires — is a business decision the
 * base document does NOT fix (§9/§10).
 *
 * TODO(client): populate/seed VERIFICATION_LEVELS once the client confirms the
 * ladder. It is intentionally EMPTY so no requirement is invented: with an empty
 * ladder every org sits at level 0 until the catalog is defined. Unit tests
 * exercise the mechanism with their own test catalog.
 */
export interface LevelRequirement {
  /** Numeric tier (>= 1), higher = more verified. */
  level: number;
  /** Human-readable label of the tier. */
  label: string;
  /** Document types that must be Approved AND current to reach this tier. */
  requiredDocuments: DocumentType[];
}

export const VERIFICATION_LEVELS: readonly LevelRequirement[] = [
  // TODO(client): e.g.
  // { level: 1, label: 'Verificada', requiredDocuments: [DocumentType.Rut] },
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

/**
 * Compute the verification level from the org's documents. Advances through the
 * (ordered) ladder while each tier's required documents are all satisfied; stops
 * at the first unmet tier and reports what blocks it.
 */
export function computeVerificationLevel(
  documents: readonly DocumentSnapshot[],
  levels: readonly LevelRequirement[],
  now: Date,
): VerificationLevel {
  const satisfied = satisfiedDocumentTypes(documents, now);
  const ladder = [...levels].sort((a, b) => a.level - b.level);

  const criteria: string[] = [];
  let achievedLevel = 0;
  let label: string | undefined;

  for (const tier of ladder) {
    const missing = tier.requiredDocuments.filter((type) => !satisfied.has(type));
    if (missing.length > 0) {
      // First unmet tier: this is what the org is blocked on.
      return {
        level: achievedLevel,
        label,
        criteria,
        nextLevel: tier.level,
        blockedBy: missing,
      };
    }
    achievedLevel = tier.level;
    label = tier.label;
    criteria.push(...tier.requiredDocuments.map((type) => `${type}:approved`));
  }

  // Reached the top of the configured ladder (or the ladder is empty).
  return { level: achievedLevel, label, criteria };
}

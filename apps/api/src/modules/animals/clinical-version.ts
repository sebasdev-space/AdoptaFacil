import type { ClinicalEventType } from '@adoptafacil/contracts';

/**
 * Immutable field-set of one clinical event VERSION. `buildNextVersion` derives
 * the next version's state from the previous one plus an edit patch — a PURE
 * function (no DB, no mutation of `prev`) so the versioning rules are unit
 * tested in isolation. Immutability of earlier rows is enforced in the DB
 * (append-only triggers); this only computes the NEW version's values.
 */
export interface ClinicalVersionState {
  type: ClinicalEventType;
  occurredAt: Date;
  nextDueDate: Date | null;
  details: Record<string, unknown>;
  version: number;
}

export interface ClinicalVersionPatch {
  type?: ClinicalEventType;
  occurredAt?: Date;
  /** `undefined` carries the previous value forward; a Date overrides it. */
  nextDueDate?: Date;
  details?: Record<string, unknown>;
}

/**
 * Compute the next version's state: provided patch fields override, omitted ones
 * carry forward, and `version` increments by one. Never mutates `prev`.
 */
export function buildNextVersion(
  prev: ClinicalVersionState,
  patch: ClinicalVersionPatch,
): ClinicalVersionState {
  return {
    type: patch.type ?? prev.type,
    occurredAt: patch.occurredAt ?? prev.occurredAt,
    nextDueDate: patch.nextDueDate !== undefined ? patch.nextDueDate : prev.nextDueDate,
    details: patch.details ?? prev.details,
    version: prev.version + 1,
  };
}

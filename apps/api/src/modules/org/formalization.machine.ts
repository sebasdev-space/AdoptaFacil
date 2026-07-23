import { DocumentType, FORMALIZATION_SEQUENCE, FormalizationState } from '@adoptafacil/contracts';

/**
 * Pure formalization state machine (RF02). The valid path is the ordered
 * sequence Informal → EnProceso → Formalizada → ESAL → ESAL_RTE. Movement is one
 * ADJACENT step at a time: forward (i → i+1) freely, or backward (i → i-1) with
 * a reason (team decision — the base document fixes the sequence but not the
 * per-transition requirements; those stay parametrizable).
 *
 * T-103: a forward step MAY additionally be gated by documents — see
 * {@link TRANSITION_REQUIREMENTS} and {@link checkTransition}'s `ctx`. The base
 * document does NOT fix WHICH documents gate each step, so the catalog is left
 * empty (TODO(client)); the mechanism is fully wired end-to-end (see
 * FormalizationService, which loads the org's approved & current document types
 * and passes them in).
 */
export type TransitionKind = 'forward' | 'backward';

export interface TransitionCheck {
  allowed: boolean;
  kind?: TransitionKind;
  /** Backward moves require a reason. */
  requiresReason: boolean;
  /** Present when `allowed` is false — a clear, user-facing message. */
  error?: string;
}

/**
 * Parametrizable per-transition document requirements, keyed by the TARGET state
 * of a forward step: to advance INTO that state, the listed document types must
 * be Approved AND current (vigente) for the organization.
 *
 * TODO(client): intentionally EMPTY — no requirement is invented here. With an
 * empty map every adjacent forward step is structurally allowed (the T-102
 * behavior is preserved). Populate/seed once the client confirms which documents
 * gate each advance.
 */
export const TRANSITION_REQUIREMENTS: Partial<Record<FormalizationState, readonly DocumentType[]>> =
  {
    // TODO(client): e.g.
    // [FormalizationState.Formalizada]: [DocumentType.ExistenceRepresentationCertificate],
  };

export interface TransitionContext {
  /** Document types currently Approved AND vigente for the org. */
  satisfiedDocuments?: readonly DocumentType[];
  /** Requirements map to consult; defaults to {@link TRANSITION_REQUIREMENTS}.
   *  Overridable so the gate can be unit-tested without a seeded catalog. */
  requirements?: Partial<Record<FormalizationState, readonly DocumentType[]>>;
}

function indexOf(state: FormalizationState): number {
  return FORMALIZATION_SEQUENCE.indexOf(state);
}

export function checkTransition(
  from: FormalizationState,
  to: FormalizationState,
  ctx: TransitionContext = {},
): TransitionCheck {
  const i = indexOf(from);
  const j = indexOf(to);
  if (i === -1 || j === -1) {
    return { allowed: false, requiresReason: false, error: 'Unknown formalization state.' };
  }
  if (i === j) {
    return {
      allowed: false,
      requiresReason: false,
      error: `The organization is already in "${to}".`,
    };
  }
  if (j === i + 1) {
    // Forward step — enforce the parametrizable document gate (if any).
    const requirements = ctx.requirements ?? TRANSITION_REQUIREMENTS;
    const required = requirements[to] ?? [];
    if (required.length > 0) {
      const satisfied = new Set(ctx.satisfiedDocuments ?? []);
      const missing = required.filter((type) => !satisfied.has(type));
      if (missing.length > 0) {
        return {
          allowed: false,
          requiresReason: false,
          error:
            `Cannot advance to "${to}": the required documents must be approved and ` +
            `current (vigente) first — missing/expired: ${missing.join(', ')}.`,
        };
      }
    }
    return { allowed: true, kind: 'forward', requiresReason: false };
  }
  if (j === i - 1) {
    return { allowed: true, kind: 'backward', requiresReason: true };
  }
  return {
    allowed: false,
    requiresReason: false,
    error: `Invalid transition from "${from}" to "${to}": only one adjacent step is allowed (no skipping states).`,
  };
}

/** rteVigente is coherent with the state: only ESAL_RTE implies it. */
export function rteVigenteFor(state: FormalizationState): boolean {
  return state === FormalizationState.ESAL_RTE;
}

import { FORMALIZATION_SEQUENCE, FormalizationState } from '@adoptafacil/contracts';

/**
 * Pure formalization state machine (RF02). The valid path is the ordered
 * sequence Informal → EnProceso → Formalizada → ESAL → ESAL_RTE. Movement is one
 * ADJACENT step at a time: forward (i → i+1) freely, or backward (i → i-1) with
 * a reason (team decision — the base document fixes the sequence but not the
 * per-transition requirements; those stay parametrizable).
 *
 * TODO(client): the concrete requirements/criteria for each forward transition
 * (which documents/checks gate e.g. Formalizada → ESAL) are NOT defined by the
 * base document. Wire them here as a per-transition guard once the client
 * confirms them; for now any adjacent step is structurally allowed.
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

function indexOf(state: FormalizationState): number {
  return FORMALIZATION_SEQUENCE.indexOf(state);
}

export function checkTransition(from: FormalizationState, to: FormalizationState): TransitionCheck {
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

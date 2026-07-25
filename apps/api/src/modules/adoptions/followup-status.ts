import type { FollowUpMilestoneStatus } from '@adoptafacil/contracts';

/**
 * Máquina de estados del HITO de seguimiento (§M04, RF12). PURA (sin NestJS) para
 * testearla directa; el service traduce el resultado a excepciones.
 *
 *   scheduled → completed | overdue      (completed TERMINAL)
 *   overdue   → completed                 (se puede completar tarde)
 *
 * La alerta se dispara en la transición a `overdue` (la ejecuta el worker).
 */
export const FOLLOWUP_TRANSITIONS: Record<
  FollowUpMilestoneStatus,
  readonly FollowUpMilestoneStatus[]
> = {
  scheduled: ['completed', 'overdue'],
  overdue: ['completed'],
  completed: [],
};

/** ¿Es válido mover un hito de `from` a `to`? */
export function canTransitionFollowUp(
  from: FollowUpMilestoneStatus,
  to: FollowUpMilestoneStatus,
): boolean {
  return FOLLOWUP_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface FollowUpTransitionCheck {
  allowed: boolean;
  error?: string;
}

/** Valida una transición del hito y explica el rechazo (para 4xx en el service). */
export function checkFollowUpTransition(
  from: FollowUpMilestoneStatus,
  to: FollowUpMilestoneStatus,
): FollowUpTransitionCheck {
  if (from === 'completed') {
    return { allowed: false, error: 'El hito ya está completado.' };
  }
  if (from === to) {
    return { allowed: false, error: `El hito ya está en estado "${from}".` };
  }
  if (!canTransitionFollowUp(from, to)) {
    return { allowed: false, error: `Transición de hito no permitida: ${from} → ${to}.` };
  }
  return { allowed: true };
}

/** ¿Puede el adoptante responder/completar este hito? (scheduled u overdue). */
export function canSubmitFollowUp(status: FollowUpMilestoneStatus): boolean {
  return status === 'scheduled' || status === 'overdue';
}

import type { AdoptionStatus } from '@adoptafacil/contracts';

/**
 * Máquina de estados de la solicitud de adopción (§M04). PURA (sin NestJS) para
 * poder testearla directamente; el service traduce el resultado a excepciones.
 *
 *   new → in_review → approved | rejected      (approved/rejected terminales)
 *
 * Solo avance hacia adelante en este corte (T-028a): no hay retroceso ni
 * reapertura; T-028b/T-028c podrán extender el grafo sin romper consumidores.
 */
export const ADOPTION_TRANSITIONS: Record<AdoptionStatus, readonly AdoptionStatus[]> = {
  new: ['in_review'],
  in_review: ['approved', 'rejected'],
  approved: [],
  rejected: [],
};

/** ¿Es válido mover una solicitud de `from` a `to`? */
export function canTransitionAdoption(from: AdoptionStatus, to: AdoptionStatus): boolean {
  return ADOPTION_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface AdoptionTransitionCheck {
  allowed: boolean;
  error?: string;
}

/** Valida una transición y explica el rechazo (para 4xx en el service). */
export function checkAdoptionTransition(
  from: AdoptionStatus,
  to: AdoptionStatus,
): AdoptionTransitionCheck {
  if (from === to) {
    return { allowed: false, error: `La solicitud ya está en estado "${from}".` };
  }
  if (!canTransitionAdoption(from, to)) {
    return { allowed: false, error: `Transición no permitida: ${from} → ${to}.` };
  }
  return { allowed: true };
}

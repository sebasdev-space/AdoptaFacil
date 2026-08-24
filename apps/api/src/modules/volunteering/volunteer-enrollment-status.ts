import { VolunteerEnrollmentStatus } from '@adoptafacil/contracts';

/**
 * Máquina de estados de la inscripción de voluntariado (RF18). PURA (sin
 * NestJS) para poder testearla directamente; el service traduce el resultado
 * a excepciones.
 *
 *   pending → accepted | rejected  (decisión de la organización)
 *   accepted → completed           (la organización cierra el ciclo)
 *
 * No se inventan estados fuera de RF18.
 */
export const ENROLLMENT_TRANSITIONS: Record<
  VolunteerEnrollmentStatus,
  readonly VolunteerEnrollmentStatus[]
> = {
  [VolunteerEnrollmentStatus.Pending]: [
    VolunteerEnrollmentStatus.Accepted,
    VolunteerEnrollmentStatus.Rejected,
  ],
  [VolunteerEnrollmentStatus.Accepted]: [VolunteerEnrollmentStatus.Completed],
  [VolunteerEnrollmentStatus.Rejected]: [],
  [VolunteerEnrollmentStatus.Completed]: [],
};

/** ¿Es válido mover una inscripción de `from` a `to`? */
export function canTransitionEnrollment(
  from: VolunteerEnrollmentStatus,
  to: VolunteerEnrollmentStatus,
): boolean {
  return ENROLLMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface EnrollmentTransitionCheck {
  allowed: boolean;
  error?: string;
}

/** Valida una transición y explica el rechazo (para 4xx en el service). */
export function checkEnrollmentTransition(
  from: VolunteerEnrollmentStatus,
  to: VolunteerEnrollmentStatus,
): EnrollmentTransitionCheck {
  if (from === to) {
    return { allowed: false, error: `La inscripción ya está en estado "${from}".` };
  }
  if (!canTransitionEnrollment(from, to)) {
    return { allowed: false, error: `Transición no permitida: ${from} → ${to}.` };
  }
  return { allowed: true };
}

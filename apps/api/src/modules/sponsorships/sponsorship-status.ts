import { SponsorshipStatus } from '@adoptafacil/contracts';

/**
 * Máquina de estados del apadrinamiento (§M07, RF17). PURA (sin NestJS) para
 * poder testearla directamente; el service traduce el resultado a excepciones.
 *
 *   active ↔ suspended            (suspender / reactivar)
 *   active | suspended → cancelled (baja, TERMINAL — sin reactivación)
 *
 * No se inventan estados fuera de RF17.
 */
export const SPONSORSHIP_TRANSITIONS: Record<SponsorshipStatus, readonly SponsorshipStatus[]> = {
  [SponsorshipStatus.Active]: [SponsorshipStatus.Suspended, SponsorshipStatus.Cancelled],
  [SponsorshipStatus.Suspended]: [SponsorshipStatus.Active, SponsorshipStatus.Cancelled],
  [SponsorshipStatus.Cancelled]: [],
};

/** ¿Es válido mover un apadrinamiento de `from` a `to`? */
export function canTransitionSponsorship(from: SponsorshipStatus, to: SponsorshipStatus): boolean {
  return SPONSORSHIP_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface SponsorshipTransitionCheck {
  allowed: boolean;
  error?: string;
}

/** Valida una transición y explica el rechazo (para 4xx en el service). */
export function checkSponsorshipTransition(
  from: SponsorshipStatus,
  to: SponsorshipStatus,
): SponsorshipTransitionCheck {
  if (from === to) {
    return { allowed: false, error: `El apadrinamiento ya está en estado "${from}".` };
  }
  if (!canTransitionSponsorship(from, to)) {
    return { allowed: false, error: `Transición no permitida: ${from} → ${to}.` };
  }
  return { allowed: true };
}

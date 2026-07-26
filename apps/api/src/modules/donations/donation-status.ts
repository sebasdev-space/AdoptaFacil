import type { DonationStatus } from '@adoptafacil/contracts';

/**
 * Máquina de estados de la DONACIÓN (§M05, P1). PURA (sin NestJS) para poder
 * testearla directamente; el service traduce el resultado a excepciones/efectos.
 *
 *   pending → approved | declined            (approved/declined terminales)
 *
 * `approved` dispara el recibo automático; `declined` cierra sin recibo. Solo
 * avance desde `pending`; `voided`/`refund` (§24) están en pausa y no entran aquí.
 * El contrato `DONATION_TRANSITIONS` es la fuente compartida con el frontend.
 */
export interface DonationTransitionCheck {
  allowed: boolean;
  error?: string;
}

/** ¿Es válido mover una donación de `from` a `to`? (espejo del contrato). */
export function canTransitionDonation(from: DonationStatus, to: DonationStatus): boolean {
  const FORWARD: Record<DonationStatus, readonly DonationStatus[]> = {
    pending: ['approved', 'declined'],
    approved: [],
    declined: [],
  };
  return FORWARD[from]?.includes(to) ?? false;
}

/** Valida una transición y explica el rechazo (para 4xx / no-op en el service). */
export function checkDonationTransition(
  from: DonationStatus,
  to: DonationStatus,
): DonationTransitionCheck {
  if (from === to) {
    return { allowed: false, error: `La donación ya está en estado "${from}".` };
  }
  if (!canTransitionDonation(from, to)) {
    return { allowed: false, error: `Transición no permitida: ${from} → ${to}.` };
  }
  return { allowed: true };
}

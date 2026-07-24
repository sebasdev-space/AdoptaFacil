import type { AdoptionContractStatus } from '@adoptafacil/contracts';

/**
 * Máquina de estados del CONTRATO de adopción (§M04, RF11). PURA (sin NestJS) para
 * testearla directa; el service traduce el resultado a excepciones.
 *
 *   draft → pending_signatures → signed        (signed es TERMINAL/inmutable)
 *   draft | pending_signatures → cancelled      (nunca desde signed)
 *
 * `signed` no tiene transiciones de salida: un contrato firmado queda sellado por
 * hash e inmutable (reforzado además por trigger en DB).
 */
export const ADOPTION_CONTRACT_TRANSITIONS: Record<
  AdoptionContractStatus,
  readonly AdoptionContractStatus[]
> = {
  draft: ['pending_signatures', 'cancelled'],
  pending_signatures: ['signed', 'cancelled'],
  signed: [],
  cancelled: [],
};

/** ¿Es válido mover el contrato de `from` a `to`? */
export function canTransitionContract(
  from: AdoptionContractStatus,
  to: AdoptionContractStatus,
): boolean {
  return ADOPTION_CONTRACT_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface ContractTransitionCheck {
  allowed: boolean;
  error?: string;
}

/** Valida una transición del contrato y explica el rechazo (para 4xx en el service). */
export function checkContractTransition(
  from: AdoptionContractStatus,
  to: AdoptionContractStatus,
): ContractTransitionCheck {
  if (from === 'signed') {
    return { allowed: false, error: 'El contrato está firmado y es inmutable.' };
  }
  if (from === to) {
    return { allowed: false, error: `El contrato ya está en estado "${from}".` };
  }
  if (!canTransitionContract(from, to)) {
    return { allowed: false, error: `Transición de contrato no permitida: ${from} → ${to}.` };
  }
  return { allowed: true };
}

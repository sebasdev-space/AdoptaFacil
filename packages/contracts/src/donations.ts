// Module: M05 donations · Contracts owner: @fabian
//
// P1 pitch (cliente): una Persona dona a una organización, ve el DESGLOSE
// transparente antes de pagar, puede marcar "cubro la comisión", y al aprobarse el
// pago se emite un RECIBO automático. El motor de dinero es M15 (PaymentPort): este
// contrato NO recalcula comisiones — CONSUME `computeBreakdown`/`PaymentBreakdown`
// desde `./payments`, que es la ÚNICA fuente de la cuenta (checkout y recibo
// muestran lo mismo).
//
// Decisiones cerradas heredadas de payments.ts (NO reabrir): Wompi, recaudo +
// dispersión T+1 (la dispersión real es M15, fuera de M05), SIN split, comisión
// plataforma 4%, pasarela 2,65%+700, IVA 19% solo sobre comisiones, COP (pesos
// enteros), sin custodia de saldos.

import type {
  CommissionPayer,
  PaymentBreakdown,
  PaymentConcept,
  PaymentCurrency,
} from './payments';

/**
 * Máquina de estados de la DONACIÓN (subconjunto de `PaymentStatus` relevante para
 * M05): `pending → approved | declined`. `approved` es terminal y dispara el recibo;
 * `declined` es terminal sin recibo. `voided`/`refund` (§24) están en pausa y NO
 * entran en este corte.
 */
export type DonationStatus = 'pending' | 'approved' | 'declined';

/** Todos los estados de donación (para validación en runtime, p. ej. zod). */
export const DONATION_STATUSES: readonly DonationStatus[] = ['pending', 'approved', 'declined'];

/**
 * Transiciones permitidas por estado — espejo de la máquina de estados del backend
 * (la API es la autoridad; el frontend solo la usa para decidir qué mostrar).
 * `pending` avanza a `approved`/`declined`; los terminales no avanzan.
 */
export const DONATION_TRANSITIONS: Record<DonationStatus, readonly DonationStatus[]> = {
  pending: ['approved', 'declined'],
  approved: [],
  declined: [],
};

/** ¿Es válido mover una donación de `from` a `to`? */
export function canTransitionDonation(from: DonationStatus, to: DonationStatus): boolean {
  return DONATION_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Monto mínimo de una donación (COP, pesos enteros). Parametrizable: TODO(client). */
export const MIN_DONATION_AMOUNT = 1000;

/**
 * Contacto del donante que se persiste con la donación y se sella en el recibo
 * (dato personal Ley 1581 — nunca en claro en auditoría). Espeja `PaymentPayer` de
 * M15 más el nombre visible del recibo.
 */
export interface DonationDonor {
  fullName?: string;
  email?: string;
  documentId?: string;
}

/**
 * DONACIÓN (dato de negocio tenant-scoped: lleva `organizationId` y RLS). Los montos
 * son pesos enteros COP; `breakdown` es el desglose auditable calculado por
 * `computeBreakdown` (RNF12), no aritmética propia.
 */
export interface Donation {
  id: string;
  /** Organización BENEFICIARIA (dueña del recaudo). */
  organizationId: string;
  /** Persona autenticada que donó (fijada por el backend desde el JWT). */
  donorUserId: string;
  /** Para qué es la donación (P1: la organización; forward-compat animal/campaña). */
  concept: PaymentConcept;
  /** Quién asume las comisiones — la casilla "cubro la comisión" (P1). */
  commissionPayer: CommissionPayer;
  /** Pesos que la Persona QUIERE que reciba la org (objetivo neto). */
  intendedAmount: number;
  /** Pesos que efectivamente se cobran al instrumento del donante. */
  amountCharged: number;
  currency: PaymentCurrency;
  /** Desglose itemizado y auditable (fuente única: `computeBreakdown`). */
  breakdown: PaymentBreakdown;
  /** Id del recaudo en el PaymentPort (correlación con el webhook). */
  collectionId: string;
  status: DonationStatus;
  /** Contacto del donante (opcional; dato personal). */
  payer?: DonationDonor;
  createdAt: string;
  updatedAt: string;
}

/**
 * RECIBO automático de la donación (P1). Documento autoconsistente: sella el donante,
 * el monto pretendido y el desglose en el momento de la aprobación. Es idempotente
 * por `dedupKey` (un webhook repetido NO emite un segundo recibo). NO es el
 * certificado tributario / exógena 2575 (superficie mayor, fuera de esta tarea).
 */
export interface DonationReceipt {
  id: string;
  organizationId: string;
  donationId: string;
  /** Clave de deduplicación del webhook que emitió el recibo (único). */
  dedupKey: string;
  /** Donante sellado en el recibo. */
  donor: DonationDonor;
  intendedAmount: number;
  /** Desglose sellado (idéntico al de la donación). */
  breakdown: PaymentBreakdown;
  /** UTC de emisión (hora Colombia solo en presentación). */
  issuedAt: string;
}

/** Donación con su recibo (presente solo cuando `status === 'approved'`). */
export interface DonationWithReceipt extends Donation {
  receipt?: DonationReceipt;
}

/**
 * Alta de una donación por una Persona autenticada. El backend calcula el desglose
 * con `computeBreakdown` (no se confía en montos del cliente salvo `intendedAmount`)
 * y procesa el recaudo vía PaymentPort. `idempotencyKey` evita duplicar la donación
 * y el cobro ante un reintento.
 */
export interface CreateDonationInput {
  /** Organización beneficiaria. */
  organizationId: string;
  /** Pesos enteros que deben llegar a la org (objetivo neto, > 0). */
  intendedAmount: number;
  /** "Cubro la comisión" marcada ⇒ 'donor'; desmarcada ⇒ 'organization'. */
  commissionPayer: CommissionPayer;
  /** Concepto; por defecto la propia organización (P1). */
  concept?: PaymentConcept;
  /** Contacto del donante (opcional). */
  payer?: DonationDonor;
  /** Clave idempotente provista por el cliente. */
  idempotencyKey: string;
}

/**
 * Sobre de webhook del PaymentPort que el gateway (fake en Ola 1) entrega para
 * confirmar/rechazar un recaudo. La API lo verifica y normaliza con
 * `PaymentPort.verifyAndNormalizeWebhook` antes de aplicarlo.
 */
export interface DonationWebhookInput {
  payload: unknown;
  signature: string;
}

// Module: M05 donations · Contracts owner: @fabian
//
// P1 pitch (cliente): una Persona dona a una organización, ve el DESGLOSE
// transparente antes de pagar, puede marcar "cubro la comisión", y al aprobarse el
// pago se emite un RECIBO automático. El motor de dinero es M15 (PaymentPort): este
// contrato NO recalcula comisiones — CONSUME `computeBreakdown`/`PaymentBreakdown`
// desde `./payments`, que es la ÚNICA fuente de la cuenta (checkout y recibo
// muestran lo mismo).
//
// Decisiones cerradas heredadas de payments.ts (NO reabrir): MercadoPago (reemplazó
// a Wompi por completo), recaudo + dispersión T+1 MANUAL (la dispersión real es
// M15, fuera de M05), SIN split, comisión plataforma 4%, pasarela 2,65%+700 (cifra
// de Wompi, pendiente confirmación del cliente para MercadoPago — ver TODO(client)
// en payments.ts), IVA 19% solo sobre comisiones, COP (pesos enteros), sin
// custodia de saldos.

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
  /**
   * Nombre visible de la organización beneficiaria. Opcional y aditivo: solo
   * `GET /donations/mine` lo resuelve (S1-02, bandeja "mis donaciones" del
   * donante, que no conoce el nombre por fuera de este id); el resto de rutas
   * (creación, webhook, `donations/received`) lo dejan `undefined`.
   */
  organizationName?: string;
  /**
   * Persona autenticada que donó (fijada por el backend desde el JWT), o `null`
   * para un donante INVITADO (checkout de invitado — donar no requiere cuenta
   * ni login).
   */
  donorUserId: string | null;
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
  /**
   * "Donación anónima frente a la organización": cuando es `true`,
   * `GET /donations/received` nunca expone `payer`/`receipt.donor` a la
   * organización beneficiaria. AdoptaFácil sigue conservando el dato real
   * internamente (legal/certificado) — esto NO afecta lo persistido.
   */
  anonymous: boolean;
  createdAt: string;
  updatedAt: string;
  /**
   * URL del checkout de MercadoPago (Checkout Pro) donde el donante completa
   * el pago. Aditivo y EFÍMERO a propósito: solo viaja en la respuesta de
   * `POST /donations` (justo tras crearla) — NUNCA se persiste en la fila ni
   * se vuelve a poblar al releer la donación (`/donations/mine`,
   * `/donations/received`, el acceso de invitado, etc. la dejan `undefined`).
   * Un link de checkout de MercadoPago es de corta vida; el flujo de
   * "consultar mi donación más tarde" ya está cubierto por el recibo/
   * certificado y, para un invitado, el magic link por correo — nunca por
   * este campo. El frontend redirige el navegador aquí (`window.location.href`)
   * en vez de mostrar la pantalla de "gracias" localmente.
   */
  paymentLinkUrl?: string;
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
  /**
   * Contacto del donante (opcional para una Persona autenticada — se puede
   * prellenar de la sesión; REQUERIDO al menos `email` para un donante
   * INVITADO, validado en el servicio, no aquí, porque depende del actor).
   */
  payer?: DonationDonor;
  /** Clave idempotente provista por el cliente. */
  idempotencyKey: string;
  /** "¿Donar de forma anónima frente a la organización?" (default `false`). */
  anonymous?: boolean;
  /**
   * Checkout API (Orders) — T-OrdersAPI. Tokenized card data from MercadoPago's
   * Card Payment Brick (card number never reaches this backend). Optional on
   * this contract/DTO (additive — existing callers/tests that build this
   * object without a card keep compiling, and the fake driver still approves
   * without one); the REAL gateway adapter requires it and throws a clear
   * error otherwise. See `CreateCollectionInput` (payments.ts) for the full
   * field-by-field rationale — these four mirror it verbatim.
   */
  cardToken?: string;
  paymentMethodId?: string;
  paymentMethodType?: 'credit_card' | 'debit_card';
  installments?: number;
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

/**
 * Certificado de donación real (RF14, F-3). Documento con validez tributaria de
 * una ESAL con RTE vigente: plantilla + hash SHA-256 del payload canónico +
 * código único verificable públicamente. Se emite automáticamente junto al
 * recibo (al aprobarse la donación), SOLO si la organización beneficiaria es
 * ESAL con RTE vigente en ese momento — si no lo es, sencillamente no existe
 * para esa donación (nunca un certificado marcado como "inválido").
 *
 * Inmutable: una vez emitido, el hash y el código nunca cambian (mismo
 * principio que `AdoptionContract.contentHash`).
 */
export interface DonationCertificate {
  id: string;
  organizationId: string;
  donationId: string;
  /** Código único verificable públicamente (formato `ADF-CERT-<año>-<secuencia>`). */
  code: string;
  organizationName: string;
  /** Siempre presente: solo se emite para organizaciones ESAL con RTE, que ya implica NIT. */
  organizationNit: string;
  /** Nombre del donante sellado en el certificado (fallback genérico si no dejó su nombre). */
  donorName: string;
  amount: number;
  currency: PaymentCurrency;
  issuedAt: string;
  contentHash: string;
}

/**
 * Proyección PÚBLICA de verificación (misma forma hoy que `DonationCertificate`
 * menos los ids internos; tipo propio para que la superficie pública pueda
 * divergir sin romper la privada — mismo patrón que `OrganizationPublic` vs
 * `Organization`). Nunca expone `id`/`organizationId`/`donationId`.
 */
export interface DonationCertificateVerification {
  code: string;
  organizationName: string;
  organizationNit: string;
  donorName: string;
  amount: number;
  currency: PaymentCurrency;
  issuedAt: string;
  contentHash: string;
}

/**
 * Proyección PÚBLICA de la donación de un donante INVITADO, alcanzada vía el
 * "magic link" enviado por correo al aprobarse su donación (requisito final
 * del cliente: tampoco obligar al invitado a crear cuenta para volver a
 * consultar su donación — mismo principio que el checkout de invitado).
 * Empaqueta en UNA respuesta lo que un donante AUTENTICADO ya obtiene con tres
 * llamadas (`GET /donations/mine` + `.../receipt` + `.../certificate`) — sin
 * inventar una forma nueva: reutiliza `Donation`/`DonationReceipt`/
 * `DonationCertificate` tal cual. `receipt`/`certificate` solo están
 * presentes cuando ya existen (donación aprobada; certificado solo si la org
 * es ESAL con RTE vigente). Nunca incluye el token de acceso.
 */
export interface GuestDonationAccess {
  donation: Donation;
  receipt?: DonationReceipt;
  certificate?: DonationCertificate;
}

/**
 * Proyección PÚBLICA y MÍNIMA para la pantalla de "gracias" post-checkout
 * (`GET /public/donations/status/:reference`), a la que MercadoPago redirige
 * al donante de vuelta (`back_urls` + `auto_return`) con `external_reference`
 * (== nuestro propio `collectionId`) en la query string. Deliberadamente
 * acotada — mismo criterio de exposición que `DonationCertificateVerification`/
 * `GuestDonationAccess`: solo estado/monto/nombre de la organización, NUNCA la
 * identidad del donante ni ids internos.
 */
export interface DonationPublicStatus {
  status: DonationStatus;
  amountCharged: number;
  currency: PaymentCurrency;
  organizationName: string;
}

/**
 * PUBLIC availability of an organization to RECEIVE donations
 * (`GET /public/donations/organizations/:organizationId/availability`, no auth).
 * `canReceiveDonations` is `true` only when the organization has connected its
 * MercadoPago account (OAuth). Deliberately a single boolean — the connected
 * account id itself is never exposed.
 */
export interface DonationOrganizationAvailability {
  organizationId: string;
  canReceiveDonations: boolean;
}

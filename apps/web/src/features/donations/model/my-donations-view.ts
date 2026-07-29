import type { BadgeProps } from '@adoptafacil/ui';
import type { Donation, DonationStatus } from '@adoptafacil/contracts';

/**
 * View-model de "Mis donaciones" (T-064). `GET /donations/mine` devuelve un
 * array DIRECTO de `Donation[]` (sin envoltorio `{ items }`) — confirmado
 * leyendo `DonationsService.listMine`/`donations_for_donor`, sin interceptor
 * global de respuesta. `normalizeDonations` igual defiende contra una forma
 * inesperada (patrón T-028c): nunca `.map()` sobre algo que no sea array.
 */
export function normalizeDonations(body: unknown): Donation[] {
  return Array.isArray(body) ? body : [];
}

/** Etiqueta es-CO por estado (subconjunto relevante de PaymentStatus, M05). */
export const DONATION_STATUS_LABELS: Record<DonationStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  declined: 'Rechazada',
};

/** Variante semántica del Badge por estado. */
export const DONATION_STATUS_BADGE_VARIANT: Record<DonationStatus, BadgeProps['variant']> = {
  pending: 'warning',
  approved: 'success',
  declined: 'destructive',
};

/**
 * Etiqueta de la organización beneficiaria. `Donation` SOLO trae
 * `organizationId` (sin nombre) — no hay endpoint que resuelva id→nombre para
 * una organización arbitraria (solo por slug, y el donante no lo tiene aquí).
 * Gap real, documentado (no se fabrica un nombre): se muestra un identificador
 * corto y estable en vez de un UUID completo.
 */
export function organizationLabel(donation: Pick<Donation, 'organizationId'>): string {
  return `Organización #${donation.organizationId.slice(0, 8)}`;
}

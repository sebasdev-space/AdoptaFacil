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
 * Etiqueta de la organización beneficiaria. `GET /donations/mine` SÍ resuelve
 * `organizationName` (S1-02, batch anti-N+1 en `DonationsService.listMine`,
 * mismo patrón que `AdoptionRequest.organizationName` de F1-01) — el id
 * truncado queda solo como fallback defensivo (p. ej. una org borrada), nunca
 * la ruta normal.
 *
 * F2-03: este era un gap real hasta ahora — el contrato y el backend ya
 * traían el nombre, pero esta función lo ignoraba y fabricaba siempre el
 * identificador corto, incluso cuando el nombre real estaba disponible.
 */
export function organizationLabel(
  donation: Pick<Donation, 'organizationId' | 'organizationName'>,
): string {
  return donation.organizationName ?? `Organización #${donation.organizationId.slice(0, 8)}`;
}

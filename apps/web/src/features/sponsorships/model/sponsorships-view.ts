import type { Sponsorship } from '@adoptafacil/contracts';
import { SponsorshipPeriodicity, SponsorshipStatus } from '@adoptafacil/contracts';

/** Etiquetas legibles (es-CO) del estado de un apadrinamiento (RF17, enum CERRADO). */
export const SPONSORSHIP_STATUS_LABELS: Record<SponsorshipStatus, string> = {
  [SponsorshipStatus.Active]: 'Activo',
  [SponsorshipStatus.Suspended]: 'Suspendido',
  [SponsorshipStatus.Cancelled]: 'Cancelado',
};

/**
 * Periodicidad — solo `monthly` existe hoy (simplificación de Ola 2, §6
 * Consolidación). TODO(client): si se habilitan otras periodicidades, esta
 * tabla crece de forma aditiva; la UI no asume ninguna distinta a "Mensual".
 */
export const SPONSORSHIP_PERIODICITY_LABELS: Record<SponsorshipPeriodicity, string> = {
  [SponsorshipPeriodicity.Monthly]: 'Mensual',
};

/** Variante de badge semántica por estado. */
export function sponsorshipStatusVariant(
  status: SponsorshipStatus,
): 'success' | 'warning' | 'destructive' {
  switch (status) {
    case SponsorshipStatus.Active:
      return 'success';
    case SponsorshipStatus.Suspended:
      return 'warning';
    case SponsorshipStatus.Cancelled:
      return 'destructive';
  }
}

/** Formatea pesos enteros COP (sin decimales), es-CO. */
export function formatCop(pesos: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(pesos);
}

/** Presenta un ISO-8601 UTC en hora Colombia (UTC en almacenamiento, CO en UI). */
export function formatBogota(isoUtc: string): string {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) return isoUtc;
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'medium',
  }).format(date);
}

/** Blindaje anti-regresión (mismo patrón que `normalizeDonations`/`.items`
 *  guards del resto del repo): nunca `.map()` sobre una respuesta no-array. */
export function normalizeSponsorships(body: unknown): Sponsorship[] {
  return Array.isArray(body) ? body : [];
}

/**
 * `Sponsorship.animalId`/`planId` sin nombre resuelto (rutas distintas de
 * `mine`, p. ej. la vista interna de la organización) — identificador corto en
 * vez de fabricar un nombre, mismo criterio que `organizationLabel` en
 * donations (`my-donations-view.ts`).
 */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

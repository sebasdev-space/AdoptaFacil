import type { Sponsorship, SponsorshipPlan } from '@adoptafacil/contracts';
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

/**
 * Nombre del padrino a mostrar (T-057): `sponsorName` es un snapshot tomado al
 * momento de apadrinar, presente solo en apadrinamientos creados DESPUÉS de
 * ese cambio — nunca se rellena retroactivamente. Para los anteriores (o si
 * llega vacío por cualquier razón), cae al mismo criterio de `shortId` de
 * arriba en vez de inventar un nombre.
 */
export function sponsorDisplayName(sponsorship: Sponsorship): string {
  return sponsorship.sponsorName ?? `Padrino ${shortId(sponsorship.sponsorUserId)}`;
}

/** Métricas reales del dashboard de apadrinamientos (T-DASH-APADRINAMIENTOS).
 *  `failedPaymentsCount` NO existe todavía (T-057, sin PaymentPort conectado
 *  — ver el schema `SponsorshipStatus`, que no tiene un estado de pago
 *  fallido); se deja fuera de este tipo a propósito en vez de fabricar un
 *  conteo — la página lo muestra como "—" con una nota, no como parte de
 *  este cálculo. */
export interface SponsorshipMetrics {
  activePadrinosCount: number;
  monthlyIncomeTotal: number;
  animalsSponsoredCount: number;
  animalsTotalCount: number;
}

/**
 * Calcula las métricas reales a partir de los apadrinamientos YA cargados
 * (mismo endpoint `GET /sponsorships` que ya usa la página) — sin inventar
 * ningún agregado del backend que no existe. `animalsTotalCount` se pasa
 * desde afuera (ya viene del fetch existente a `/animals`).
 */
export function computeSponsorshipMetrics(
  sponsorships: Sponsorship[],
  plansById: Map<string, SponsorshipPlan>,
  animalsTotalCount: number,
): SponsorshipMetrics {
  const active = sponsorships.filter((s) => s.status === SponsorshipStatus.Active);
  return {
    activePadrinosCount: new Set(active.map((s) => s.sponsorUserId)).size,
    monthlyIncomeTotal: active.reduce((sum, s) => sum + (plansById.get(s.planId)?.amount ?? 0), 0),
    animalsSponsoredCount: new Set(active.map((s) => s.animalId)).size,
    animalsTotalCount,
  };
}

import {
  ResourceCategory,
  ResourceDeliveryStatus,
  ResourceNeedStatus,
  ResourceOfferStatus,
} from '@adoptafacil/contracts';

/** Etiquetas legibles (es-CO) de las categorías — enum CERRADO del contrato
 *  (M09). No se inventan categorías fuera del enum. */
export const CATEGORY_LABELS: Record<ResourceCategory, string> = {
  [ResourceCategory.Food]: 'Alimento',
  [ResourceCategory.Medicine]: 'Medicamentos',
  [ResourceCategory.Supplies]: 'Insumos',
  [ResourceCategory.Equipment]: 'Equipo',
  [ResourceCategory.Other]: 'Otro',
};

export const NEED_STATUS_LABELS: Record<ResourceNeedStatus, string> = {
  [ResourceNeedStatus.Needed]: 'Necesitada',
  [ResourceNeedStatus.PartiallyFulfilled]: 'Parcialmente cubierta',
  [ResourceNeedStatus.Fulfilled]: 'Cubierta',
  [ResourceNeedStatus.Cancelled]: 'Cancelada',
};

export function needStatusVariant(
  status: ResourceNeedStatus,
): 'success' | 'secondary' | 'destructive' {
  switch (status) {
    case ResourceNeedStatus.Fulfilled:
      return 'success';
    case ResourceNeedStatus.Cancelled:
      return 'destructive';
    default:
      return 'secondary';
  }
}

export const OFFER_STATUS_LABELS: Record<ResourceOfferStatus, string> = {
  [ResourceOfferStatus.Offered]: 'Pendiente de decisión',
  [ResourceOfferStatus.Accepted]: 'Aceptada',
  [ResourceOfferStatus.Declined]: 'Rechazada',
  [ResourceOfferStatus.Cancelled]: 'Cancelada',
};

export function offerStatusVariant(
  status: ResourceOfferStatus,
): 'success' | 'secondary' | 'destructive' {
  switch (status) {
    case ResourceOfferStatus.Accepted:
      return 'success';
    case ResourceOfferStatus.Declined:
    case ResourceOfferStatus.Cancelled:
      return 'destructive';
    default:
      return 'secondary';
  }
}

export const DELIVERY_STATUS_LABELS: Record<ResourceDeliveryStatus, string> = {
  [ResourceDeliveryStatus.Scheduled]: 'Programada',
  [ResourceDeliveryStatus.Completed]: 'Completada',
  [ResourceDeliveryStatus.Cancelled]: 'Cancelada',
};

/**
 * Porcentaje de avance (0..100 entero) a partir del `progress` (0..1) del
 * contrato. Se lee el valor TAL CUAL lo entrega el backend — el frontend NO
 * calcula avance por su cuenta (mismo criterio que `progressPercent` de
 * campañas).
 */
export function progressPercent(progress: number): number {
  if (!Number.isFinite(progress) || progress <= 0) return 0;
  return Math.min(100, Math.round(progress * 100));
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

/** Enlace al detalle público de una necesidad. */
export function publicResourceNeedHref(id: string): string {
  return `/recursos/${encodeURIComponent(id)}`;
}

/** Enlace al detalle interno (gestión de la org) de una necesidad. */
export function manageResourceNeedHref(id: string): string {
  return `/organizacion/recursos/${encodeURIComponent(id)}`;
}

/**
 * Cuánto queda por cubrir de una necesidad — nunca negativo (una necesidad
 * ya `fulfilled`, o incluso sobre-cubierta, muestra 0, nunca un número
 * negativo confuso).
 */
export function remainingQuantity(quantityNeeded: number, quantityFulfilled: number): number {
  return Math.max(0, quantityNeeded - quantityFulfilled);
}

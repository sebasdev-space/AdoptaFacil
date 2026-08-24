import { ReviewStatus } from '@adoptafacil/contracts';

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  [ReviewStatus.Pending]: 'Pendiente de revisión',
  [ReviewStatus.Approved]: 'Aprobada',
  [ReviewStatus.Rejected]: 'Rechazada',
  [ReviewStatus.Hidden]: 'Oculta',
};

export function reviewStatusVariant(
  status: ReviewStatus,
): 'success' | 'warning' | 'destructive' | 'secondary' {
  switch (status) {
    case ReviewStatus.Pending:
      return 'warning';
    case ReviewStatus.Approved:
      return 'success';
    case ReviewStatus.Rejected:
    case ReviewStatus.Hidden:
      return 'destructive';
  }
}

/** "★★★★☆" — presentación simple sin depender de un ícono compartido. */
export function ratingStars(rating: number): string {
  const clamped = Math.min(Math.max(Math.round(rating), 0), 5);
  return '★'.repeat(clamped) + '☆'.repeat(5 - clamped);
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

/** Un entero 1-5, o `null` si el valor no es válido — mismo rango que el
 *  backend (`reviews.schemas.ts`). */
export function parseRating(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5 ? parsed : null;
}

import {
  ServiceHoursStatus,
  VolunteerEnrollmentStatus,
  VolunteerOpportunityStatus,
} from '@adoptafacil/contracts';

/** Categoría es TEXTO LIBRE (RF18 no fija un catálogo cerrado, a diferencia
 *  de las campañas) — no hay un mapa de etiquetas que mantener aquí. */

export const OPPORTUNITY_STATUS_LABELS: Record<VolunteerOpportunityStatus, string> = {
  [VolunteerOpportunityStatus.Active]: 'Activa',
  [VolunteerOpportunityStatus.Closed]: 'Cerrada',
};

export function opportunityStatusVariant(
  status: VolunteerOpportunityStatus,
): 'success' | 'secondary' {
  return status === VolunteerOpportunityStatus.Active ? 'success' : 'secondary';
}

export const ENROLLMENT_STATUS_LABELS: Record<VolunteerEnrollmentStatus, string> = {
  [VolunteerEnrollmentStatus.Pending]: 'Pendiente',
  [VolunteerEnrollmentStatus.Accepted]: 'Aceptada',
  [VolunteerEnrollmentStatus.Rejected]: 'Rechazada',
  [VolunteerEnrollmentStatus.Completed]: 'Completada',
};

export function enrollmentStatusVariant(
  status: VolunteerEnrollmentStatus,
): 'success' | 'warning' | 'destructive' | 'secondary' {
  switch (status) {
    case VolunteerEnrollmentStatus.Pending:
      return 'warning';
    case VolunteerEnrollmentStatus.Accepted:
      return 'success';
    case VolunteerEnrollmentStatus.Rejected:
      return 'destructive';
    case VolunteerEnrollmentStatus.Completed:
      return 'secondary';
  }
}

export const HOURS_STATUS_LABELS: Record<ServiceHoursStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobadas',
  rejected: 'Rechazadas',
};

export function hoursStatusVariant(
  status: ServiceHoursStatus,
): 'success' | 'warning' | 'destructive' {
  switch (status) {
    case 'pending':
      return 'warning';
    case 'approved':
      return 'success';
    case 'rejected':
      return 'destructive';
  }
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

/** "2.5 h" / "1 h" — nunca fabrica un plural incorrecto para 1. */
export function formatHours(hours: number): string {
  return `${hours} h`;
}

/**
 * Parsea las horas de una sesión: un número positivo, hasta 24h (mismo límite
 * que el backend, `service-hours.schemas.ts`), en cualquier otro caso `null`
 * (inválido) — para que el formulario valide exactamente lo mismo que la API,
 * en vez de reimplementar el chequeo con un criterio distinto.
 */
export function parseSessionHours(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 24 ? parsed : null;
}

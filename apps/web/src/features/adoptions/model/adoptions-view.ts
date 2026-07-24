import type { AdoptionStatus } from '@adoptafacil/contracts';

/** Kanban columns in evaluation order (§M04). */
export const ADOPTION_COLUMNS: readonly AdoptionStatus[] = [
  'new',
  'in_review',
  'approved',
  'rejected',
];

/** Human labels (es-CO) per status. */
export const ADOPTION_STATUS_LABELS: Record<AdoptionStatus, string> = {
  new: 'Nuevas',
  in_review: 'En evaluación',
  approved: 'Aprobada',
  rejected: 'Rechazada',
};

/**
 * Allowed forward transitions per status — mirrors the backend state machine
 * (the API is the authority; this only drives which buttons the UI offers).
 */
export const ADOPTION_NEXT_STATUSES: Record<AdoptionStatus, readonly AdoptionStatus[]> = {
  new: ['in_review'],
  in_review: ['approved', 'rejected'],
  approved: [],
  rejected: [],
};

/** Badge variant per status (semantic, not the brand accent). */
export function adoptionStatusVariant(
  status: AdoptionStatus,
): 'outline' | 'info' | 'success' | 'destructive' {
  switch (status) {
    case 'new':
      return 'outline';
    case 'in_review':
      return 'info';
    case 'approved':
      return 'success';
    case 'rejected':
      return 'destructive';
  }
}

/**
 * Present an ISO-8601 UTC timestamp in Colombia time (invariant: UTC in storage,
 * hora Colombia solo en presentación). Falls back to the raw string if invalid.
 */
export function formatBogota(isoUtc: string): string {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) return isoUtc;
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

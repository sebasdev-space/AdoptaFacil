import { CampaignCategory, CampaignStatus } from '@adoptafacil/contracts';

/** Etiquetas legibles (es-CO) de las categorías — enum CERRADO del contrato (§9 M06).
 *  No se inventan categorías fuera del enum. */
export const CATEGORY_LABELS: Record<CampaignCategory, string> = {
  [CampaignCategory.Medications]: 'Medicamentos',
  [CampaignCategory.Food]: 'Alimentación',
  [CampaignCategory.Surgeries]: 'Cirugías',
  [CampaignCategory.Sterilizations]: 'Esterilizaciones',
  [CampaignCategory.Infrastructure]: 'Infraestructura',
  [CampaignCategory.Emergencies]: 'Emergencias',
};

/** Etiquetas legibles (es-CO) del estado de la campaña. */
export const STATUS_LABELS: Record<CampaignStatus, string> = {
  [CampaignStatus.Active]: 'Activa',
  [CampaignStatus.Closed]: 'Finalizada',
  [CampaignStatus.Cancelled]: 'Cancelada',
};

/** Variante de badge semántica por estado. */
export function campaignStatusVariant(
  status: CampaignStatus,
): 'success' | 'secondary' | 'destructive' {
  switch (status) {
    case CampaignStatus.Active:
      return 'success';
    case CampaignStatus.Closed:
      return 'secondary';
    case CampaignStatus.Cancelled:
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

/**
 * Porcentaje de avance (0..100 entero) a partir del `progress` (0..1) del contrato.
 * Se lee el valor TAL CUAL lo entrega el backend (hoy 0 hasta que el recaudo real se
 * conecte contra el PaymentPort); el frontend NO calcula avance por su cuenta.
 */
export function progressPercent(progress: number): number {
  if (!Number.isFinite(progress) || progress <= 0) return 0;
  return Math.min(100, Math.round(progress * 100));
}

/** Enlace al detalle público de una campaña. */
export function publicCampaignDetailHref(id: string): string {
  return `/campanas/${encodeURIComponent(id)}`;
}

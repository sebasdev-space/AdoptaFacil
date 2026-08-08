import {
  computeBreakdown,
  MIN_DONATION_AMOUNT,
  type CommissionPayer,
  type PaymentBreakdown,
} from '@adoptafacil/contracts';

/**
 * View-model del DESGLOSE de una donación (§M05, P1). La cuenta es SIEMPRE la de
 * `computeBreakdown` (M15) — el frontend NO recalcula comisiones ni el IVA: el
 * checkout y el recibo muestran exactamente lo mismo. Este módulo solo etiqueta las
 * cifras para presentación (es-CO), sobre pesos enteros COP.
 */
export interface BreakdownLine {
  key: keyof PaymentBreakdown;
  label: string;
  amount: number;
  /** La línea que resalta (lo que se cobra / lo que recibe la org). */
  emphasis?: 'charged' | 'net';
}

/** Formatea pesos enteros COP (sin decimales). */
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
 * Construye el desglose presentable a partir del monto pretendido y de quién asume
 * la comisión. `breakdown` es EXACTAMENTE `computeBreakdown(intendedAmount,
 * commissionPayer)` — misma fuente que el backend y el recibo.
 */
export function buildDonationBreakdown(
  intendedAmount: number,
  commissionPayer: CommissionPayer,
): { breakdown: PaymentBreakdown; lines: BreakdownLine[] } {
  const breakdown = computeBreakdown(intendedAmount, commissionPayer);
  const lines: BreakdownLine[] = [
    {
      key: 'amountCharged',
      label: 'Total que pagas',
      amount: breakdown.amountCharged,
      emphasis: 'charged',
    },
    {
      key: 'platformFee',
      label: 'Apoyo de sostenimiento a AdoptaFácil (4%)',
      amount: breakdown.platformFee,
    },
    {
      key: 'platformIva',
      label: 'IVA sobre el apoyo de sostenimiento a AdoptaFácil',
      amount: breakdown.platformIva,
    },
    { key: 'gatewayFee', label: 'Comisión pasarela', amount: breakdown.gatewayFee },
    { key: 'gatewayIva', label: 'IVA sobre la comisión pasarela', amount: breakdown.gatewayIva },
    {
      key: 'net',
      label: 'Neto que recibe la organización',
      amount: breakdown.net,
      emphasis: 'net',
    },
  ];
  return { breakdown, lines };
}

/**
 * Variante segura para la UI en vivo: devuelve `null` si el monto aún no es válido
 * (vacío, no entero, o por debajo del mínimo), en vez de lanzar como
 * `computeBreakdown`. Así el formulario puede pedir el desglose en cada tecla.
 */
export function safeBuildDonationBreakdown(
  intendedAmount: number,
  commissionPayer: CommissionPayer,
): { breakdown: PaymentBreakdown; lines: BreakdownLine[] } | null {
  if (!Number.isInteger(intendedAmount) || intendedAmount < MIN_DONATION_AMOUNT) {
    return null;
  }
  return buildDonationBreakdown(intendedAmount, commissionPayer);
}

/**
 * Datos de EJEMPLO del certificado de donación (§M05/RF14) para la MAQUETA del
 * pitch (T-053). CERO backend: nada de esto se genera, calcula ni persiste — el
 * código, el hash y el QR son de MUESTRA. La maqueta REPRESENTA el mecanismo que
 * fija el documento base (certificado de ESAL con RTE, código único, hash, QR y
 * página pública de verificación), sin implementarlo. El RF14 funcional es
 * post-pitch (ver TODO(RF14)).
 *
 * TODO(RF14): reemplazar por la generación real (plantilla + hash SHA-256 del
 * payload canónico —patrón de adoption-contract-hash—, código único persistido,
 * QR a la página pública, gating por ESAL-RTE consultando M01). Superficie de M05.
 */
export interface MockCertificate {
  /** Código único VERIFICABLE de muestra (formato ilustrativo). */
  code: string;
  /** Organización EMISORA de ejemplo: una ESAL con RTE vigente (fiel a RF14). */
  organizationName: string;
  organizationNit: string;
  /** Donante de ejemplo (se sobreescribe con el real si llega por nav-state). */
  donorName: string;
  /** Monto donado en pesos enteros COP (ejemplo). */
  amount: number;
  /** Fecha de emisión (ISO-8601 UTC; se presenta en hora Colombia). */
  issuedAt: string;
  /** Hash de MUESTRA (64 hex, aspecto SHA-256) — NO calculado. */
  contentHash: string;
}

export const MOCK_CERTIFICATE: MockCertificate = {
  code: 'ADF-CERT-2026-000742',
  organizationName: 'Fundación Huellas de Esperanza',
  organizationNit: '901.456.789-0',
  donorName: 'María Restrepo',
  amount: 150000,
  issuedAt: '2026-07-26T15:30:00.000Z',
  contentHash: '9f2c1ab4e77d3c0a5be81f6d24c9a0b73e5148ff62d7a9c40be1f3d287a6c015',
};

/** Ruta (maqueta) de verificación pública para un código dado. */
export function mockVerifyPath(code: string): string {
  return `/verificar/${encodeURIComponent(code)}`;
}

/** Formatea pesos enteros COP (sin decimales), es-CO. Local a la maqueta. */
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
    dateStyle: 'long',
  }).format(date);
}

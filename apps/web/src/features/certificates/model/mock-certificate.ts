/**
 * Datos del certificado de donación (§M05/RF14) para la MAQUETA MEJORADA del pitch
 * (T-053 → F-CERT-REAL). CERO backend: nada de esto se genera, calcula ni persiste
 * — el código y el hash siguen siendo de MUESTRA. La maqueta REPRESENTA el
 * mecanismo que fija el documento base (certificado de ESAL con RTE, código
 * único, hash y página pública de verificación), sin implementarlo. El RF14
 * funcional (hash real, verificación pública contra backend) es post-pitch
 * (ver TODO(RF14)).
 *
 * F-CERT-REAL (aprobado por Sebastián, 7-ago): org, NIT, donante y monto son
 * REALES cuando la donación los trae por nav-state (T-066/F2-03) — tanto en
 * `CertificateEmissionPage` como, para la MISMA sesión, en
 * `CertificateVerificationPage` (recibe el mismo certificado por nav-state al
 * seguir el link "Verificar este certificado" — sin esto, sin backend, cada
 * pantalla mostraba un set de muestra DISTINTO, la incoherencia que este cambio
 * elimina). Este objeto solo aporta el fallback de ILUSTRACIÓN para cuando la
 * maqueta se visita SIN una donación real (p. ej. `CertificateVerificationPage`
 * visitada de forma independiente/directa, sin nav-state) — código y hash.
 *
 * TODO(RF14): reemplazar por la generación real (plantilla + hash SHA-256 del
 * payload canónico —patrón de adoption-contract-hash—, código único persistido,
 * QR a la página pública, gating por ESAL-RTE consultando M01). Superficie de M05.
 */
export interface MockCertificate {
  /** Código único VERIFICABLE de muestra (formato ilustrativo). */
  code: string;
  /** Organización EMISORA: real si llegó por nav-state; si no, fallback neutro. */
  organizationName: string;
  /**
   * NIT REAL de la organización, solo si es pública y la donación lo trajo
   * (formalizada, vía `organization_public()` — F2-03). NUNCA se fabrica ni se
   * usa uno de muestra: es un dato legal sensible, y mostrarlo junto a una org
   * (real o genérica) que no lo tiene sería engañoso. Ausente ⇒ no se muestra.
   */
  organizationNit?: string;
  /** Donante: real si llegó por nav-state; si no, fallback neutro. */
  donorName: string;
  /** Monto donado en pesos enteros COP (real si llegó por nav-state). */
  amount: number;
  /** Fecha de emisión (ISO-8601 UTC; se presenta en hora Colombia). */
  issuedAt: string;
  /** Hash de MUESTRA (64 hex, aspecto SHA-256) — NO calculado. */
  contentHash: string;
}

export const MOCK_CERTIFICATE: MockCertificate = {
  code: 'ADF-CERT-2026-000742',
  organizationName: 'Fundación Huellas de Esperanza',
  donorName: 'María Restrepo',
  amount: 150000,
  issuedAt: '2026-07-26T15:30:00.000Z',
  contentHash: '9f2c1ab4e77d3c0a5be81f6d24c9a0b73e5148ff62d7a9c40be1f3d287a6c015',
};

/**
 * Fallback NEUTRO cuando `CertificateEmissionPage` O `CertificateVerificationPage`
 * se visitan SIN datos reales por nav-state (T-066/F-CERT-REAL). Nunca reintroduce
 * una entidad ficticia con nombre propio (p. ej. "Fundación Huellas de Esperanza" /
 * "María Restrepo") — solo texto genérico, honesto sobre la ausencia de datos
 * reales en ese caso. Usar el MISMO fallback en ambas pantallas es lo que las
 * mantiene consistentes cuando no hay una donación real detrás.
 */
export const CERTIFICATE_NEUTRAL_FALLBACK = {
  organizationName: 'Organización beneficiaria',
  donorName: 'Donante',
} as const;

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

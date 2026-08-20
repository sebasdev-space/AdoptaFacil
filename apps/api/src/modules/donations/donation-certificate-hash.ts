import { createHash, randomInt } from 'node:crypto';

/**
 * Payload canónico que se sella en un certificado de donación (RF14, F-3).
 * Estable: cualquier cambio de forma aquí cambiaría el hash de certificados
 * ya emitidos, así que se trata como el contrato de un documento inmutable.
 */
export interface DonationCertificatePayload {
  organizationName: string;
  organizationNit: string;
  donorName: string;
  amount: number;
  currency: string;
  issuedAt: string;
  donationId: string;
}

/** Serialización CANÓNICA (claves ordenadas) — mismo patrón que
 *  `adoption-contract-hash.ts`, para que el hash sea independiente del orden
 *  de propiedades del objeto. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** Representación canónica en texto del payload (determinista). */
export function canonicalCertificateString(payload: DonationCertificatePayload): string {
  return JSON.stringify(canonicalize(payload));
}

/** Hash SHA-256 (hex) del payload canónico — el sello de inmutabilidad del
 *  certificado (mismo patrón que `computeContractHash` de M04). */
export function computeCertificateHash(payload: DonationCertificatePayload): string {
  return createHash('sha256').update(canonicalCertificateString(payload), 'utf8').digest('hex');
}

/** Código único verificable públicamente: `ADF-CERT-<año>-<6 dígitos>`. No es
 *  secuencial (evita necesitar una secuencia/lock global entre tenants); la
 *  colisión es astronómicamente improbable y el llamador reintenta ante un
 *  conflicto de unicidad, igual que otros códigos generados del proyecto. */
export function generateCertificateCode(year: number): string {
  const suffix = randomInt(0, 1_000_000).toString().padStart(6, '0');
  return `ADF-CERT-${year}-${suffix}`;
}

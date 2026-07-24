import { createHash } from 'node:crypto';
import type { AdoptionContractPayload } from '@adoptafacil/contracts';

/**
 * Serialización CANÓNICA de un valor JSON: ordena las claves de objeto de forma
 * recursiva para que el hash sea INDEPENDIENTE del orden de propiedades. Así dos
 * payloads semánticamente iguales producen el mismo hash (invariancia, RF11/RNF05).
 */
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
export function canonicalContractString(payload: AdoptionContractPayload): string {
  return JSON.stringify(canonicalize(payload));
}

/**
 * Hash SHA-256 (hex) del payload CANÓNICO del contrato. Es el sello de
 * inmutabilidad (RF11): se calcula al completarse todas las firmas y cualquier
 * cambio posterior del contenido produciría un hash distinto.
 */
export function computeContractHash(payload: AdoptionContractPayload): string {
  return createHash('sha256').update(canonicalContractString(payload), 'utf8').digest('hex');
}

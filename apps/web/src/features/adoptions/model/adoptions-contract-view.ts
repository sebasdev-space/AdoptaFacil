import type {
  AdoptionContract,
  AdoptionContractStatus,
  AdoptionSignerRole,
} from '@adoptafacil/contracts';

/** Human labels (es-CO) per contract status. */
export const CONTRACT_STATUS_LABELS: Record<AdoptionContractStatus, string> = {
  draft: 'Borrador',
  pending_signatures: 'Pendiente de firmas',
  signed: 'Firmado',
  cancelled: 'Cancelado',
};

/** Human labels (es-CO) per signer role. */
export const SIGNER_ROLE_LABELS: Record<AdoptionSignerRole, string> = {
  organization_representative: 'Representante de la organización',
  adopter: 'Adoptante',
  witness: 'Testigo',
};

/** Badge variant per contract status (semantic). */
export function contractStatusVariant(
  status: AdoptionContractStatus,
): 'outline' | 'info' | 'success' | 'destructive' {
  switch (status) {
    case 'draft':
      return 'outline';
    case 'pending_signatures':
      return 'info';
    case 'signed':
      return 'success';
    case 'cancelled':
      return 'destructive';
  }
}

/** How many signers have signed / total (for the progress label). */
export function signatureProgress(contract: AdoptionContract): { signed: number; total: number } {
  return {
    signed: contract.signers.filter((s) => Boolean(s.signedAt)).length,
    total: contract.signers.length,
  };
}

/** Short (12-char) preview of the seal hash for the UI. */
export function shortHash(hash?: string): string {
  return hash ? `${hash.slice(0, 12)}…` : '—';
}

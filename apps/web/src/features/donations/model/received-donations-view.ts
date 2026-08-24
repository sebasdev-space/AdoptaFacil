import type { DonationWithReceipt, PaymentConcept } from '@adoptafacil/contracts';

/**
 * View-model de "Donaciones recibidas" (F-DONACIONES-RECIBIDAS) — la contraparte
 * de gestión de org de "Mis donaciones" (donante). `GET /donations/received`
 * devuelve un array DIRECTO de `DonationWithReceipt[]` (mismo patrón que
 * `GET /donations/mine`, sin envoltorio `{ items }`) — confirmado leyendo
 * `DonationsService.listReceived`. `normalizeReceivedDonations` igual defiende
 * contra una forma inesperada (patrón T-028c/my-donations-view), nunca `.map()`
 * sobre algo que no sea array.
 */
export function normalizeReceivedDonations(body: unknown): DonationWithReceipt[] {
  return Array.isArray(body) ? body : [];
}

/**
 * Identidad del donante para esta donación. `receipt.donor` SOLO existe una vez
 * que la donación está `approved` (el recibo se emite al aprobarse, vía webhook)
 * — para `pending`/`declined` el contrato no trae NINGÚN dato humano del donante
 * (solo `donorUserId`, un id opaco). No se fabrica un nombre ni se expone ese id
 * crudo: se muestra un rótulo honesto de "aún sin recibo" en ese caso.
 */
export function receivedDonorLabel(donation: DonationWithReceipt): string {
  const donor = donation.receipt?.donor;
  return donor?.fullName ?? donor?.email ?? (donation.receipt ? 'Donante' : 'Recibo pendiente');
}

/**
 * Etiqueta del concepto (§M05: a qué se destinó la donación). El contrato solo
 * trae `concept.kind` + el id crudo (organización/animal/campaña) — NINGÚN
 * endpoint resuelve ese id a un nombre en esta ruta, así que se muestra un
 * identificador corto en vez de fabricar uno (mismo criterio que
 * `organizationLabel` en my-donations-view.ts).
 */
export function donationConceptLabel(concept: PaymentConcept): string {
  const shortId = `#${concept.id.slice(0, 8)}`;
  switch (concept.kind) {
    case 'organization':
      return 'Donación general';
    case 'animal':
      return `Animal ${shortId}`;
    case 'campaign':
      return `Campaña ${shortId}`;
    case 'sponsorship':
      return `Apadrinamiento ${shortId}`;
  }
}

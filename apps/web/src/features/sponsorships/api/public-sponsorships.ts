import type {
  SponsorshipPaymentPublicStatus,
  SponsorshipPublicSummary,
} from '@adoptafacil/contracts';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/**
 * Public summary of an animal's sponsorship plans + active sponsor count
 * (`GET /public/sponsorships/animals/:animalId`, no auth, no PII — see
 * `public-sponsorships.controller.ts`). Feeds the "Apadrinar" entry point.
 *
 * ⚠️ Blindaje anti-regresión (patrón de `public-campaigns.ts`): SIEMPRE se
 * normaliza `activePlans` a `[]` si la respuesta no trae un array.
 */
export async function fetchAnimalSponsorshipSummary(
  animalId: string,
): Promise<SponsorshipPublicSummary> {
  const response = await fetch(
    `${API_BASE}/public/sponsorships/animals/${encodeURIComponent(animalId)}`,
  );
  if (!response.ok) {
    throw new Error(`No se pudo cargar el resumen de apadrinamiento (${response.status}).`);
  }
  const body = (await response.json()) as Partial<SponsorshipPublicSummary> | null;
  return {
    animalId,
    activePlans: Array.isArray(body?.activePlans) ? body.activePlans : [],
    activeSponsorCount: typeof body?.activeSponsorCount === 'number' ? body.activeSponsorCount : 0,
  };
}

/**
 * PUBLIC post-checkout status, reached from `/apadrinar/gracias` after
 * MercadoPago redirects the sponsor back with `external_reference` (== the
 * payment attempt's own `collectionId`) in the query string — PUBLIC, no
 * session, same fetch convention as {@link fetchAnimalSponsorshipSummary} /
 * donations' `fetchDonationPublicStatus`. `null` on a 404 (unknown reference
 * — never distinguished from any other reason).
 */
export async function fetchSponsorshipPaymentPublicStatus(
  reference: string,
): Promise<SponsorshipPaymentPublicStatus | null> {
  const response = await fetch(
    `${API_BASE}/public/sponsorships/status/${encodeURIComponent(reference)}`,
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('error');
  return (await response.json()) as SponsorshipPaymentPublicStatus;
}

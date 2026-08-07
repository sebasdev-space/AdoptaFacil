import type { SponsorshipPublicSummary } from '@adoptafacil/contracts';

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

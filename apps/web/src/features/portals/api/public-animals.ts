import type { AnimalSpecies, AnimalSummary, AnimalSummaryPage } from '@adoptafacil/contracts';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface FetchPublicAnimalsParams {
  slug: string;
  species?: AnimalSpecies;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

/**
 * Consume el catálogo PÚBLICO de animales adoptables de una organización (§M14/M03,
 * RF07): `GET /public/organizations/:slug/animals` (endpoint de @sebastian, #38). Sin
 * token (portal público). La respuesta viene ENVUELTA
 * (`{ items, total, limit, offset }`), NO como array.
 *
 * ⚠️ Blindaje anti-regresión (patrón del bug .map de T-028c): SIEMPRE se normaliza
 * `.items` a `[]` si no es un array, para que ningún consumidor haga `.map` sobre un
 * no-array. El backend ya excluye lo clínico/interno; aquí solo se pasan campos
 * públicos de `AnimalSummary`.
 */
export async function fetchPublicAnimals({
  slug,
  species,
  limit,
  offset,
  signal,
}: FetchPublicAnimalsParams): Promise<AnimalSummaryPage> {
  const params = new URLSearchParams();
  if (species) params.set('species', species);
  if (typeof limit === 'number') params.set('limit', String(limit));
  if (typeof offset === 'number') params.set('offset', String(offset));
  const qs = params.toString();
  const url = `${API_BASE}/public/organizations/${encodeURIComponent(slug)}/animals${
    qs ? `?${qs}` : ''
  }`;

  const response = await fetch(url, signal ? { signal } : undefined);
  if (!response.ok) {
    throw new Error('error');
  }

  const body = (await response.json()) as Partial<AnimalSummaryPage> | null;
  const items: AnimalSummary[] = Array.isArray(body?.items) ? body.items : [];
  return {
    items,
    total: typeof body?.total === 'number' ? body.total : items.length,
    limit: typeof body?.limit === 'number' ? body.limit : items.length,
    offset: typeof body?.offset === 'number' ? body.offset : 0,
  };
}

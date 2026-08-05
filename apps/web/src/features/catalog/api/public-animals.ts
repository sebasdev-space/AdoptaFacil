import type { AnimalSpecies, PublicAnimalSummary } from '@adoptafacil/contracts';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface FetchGlobalPublicAnimalsParams {
  species?: AnimalSpecies;
  city?: string;
  page?: number;
  limit?: number;
  signal?: AbortSignal;
}

export interface GlobalPublicAnimalsPage {
  data: PublicAnimalSummary[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Consume el catálogo público GLOBAL de animales adoptables, a través de todas
 * las organizaciones (F-LANDING-01): `GET /public/animals` (S1-07, @sebastian,
 * ya en main). Sin token (portal general público). La respuesta viene
 * ENVUELTA como `{ data, total, page, limit }` — NO como `{ items }` (esa es
 * la forma del catálogo POR organización que consume `features/portals`).
 *
 * Blindaje anti-regresión (mismo patrón que `fetchPublicAnimals` en
 * `features/portals`, T-028c): SIEMPRE se normaliza `.data` a `[]` si no es un
 * array, para que ningún consumidor haga `.map` sobre un no-array.
 */
export async function fetchGlobalPublicAnimals({
  species,
  city,
  page,
  limit,
  signal,
}: FetchGlobalPublicAnimalsParams): Promise<GlobalPublicAnimalsPage> {
  const params = new URLSearchParams();
  if (species) params.set('species', species);
  if (city) params.set('city', city);
  if (typeof page === 'number') params.set('page', String(page));
  if (typeof limit === 'number') params.set('limit', String(limit));
  const qs = params.toString();
  const url = `${API_BASE}/public/animals${qs ? `?${qs}` : ''}`;

  const response = await fetch(url, signal ? { signal } : undefined);
  if (!response.ok) {
    throw new Error('error');
  }

  const body = (await response.json()) as Partial<GlobalPublicAnimalsPage> | null;
  const data: PublicAnimalSummary[] = Array.isArray(body?.data) ? body.data : [];
  return {
    data,
    total: typeof body?.total === 'number' ? body.total : data.length,
    page: typeof body?.page === 'number' ? body.page : 1,
    limit: typeof body?.limit === 'number' ? body.limit : data.length,
  };
}

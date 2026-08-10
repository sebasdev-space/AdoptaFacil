import type { CampaignPublic, Paginated } from '@adoptafacil/contracts';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface FetchPublicOrgCampaignsParams {
  slug: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

/**
 * Consume el feed PÚBLICO de campañas ACTIVAS de una organización (§M14/M06,
 * F-CAMPANAS-PORTAL-2): `GET /public/organizations/:slug/campaigns` (endpoint
 * de @sebastian, S2-07 — desbloquea el placeholder `activeCampaign` de
 * `portal-view.ts`). Sin token (portal público). Mismo shape/envoltorio que
 * `GET /public/campaigns` (global): `Paginated<CampaignPublic>` = `{ items,
 * total, limit, offset }`, NO un array — y mismo patrón exacto que
 * `fetchPublicAnimals` (`public-animals.ts`) para el catálogo de mascotas.
 *
 * ⚠️ Blindaje anti-regresión (patrón T-028c/T-052): SIEMPRE se normaliza
 * `.items` a `[]` si no es un array, para que ningún consumidor haga `.map`
 * sobre un no-array.
 */
export async function fetchPublicOrgCampaigns({
  slug,
  limit,
  offset,
  signal,
}: FetchPublicOrgCampaignsParams): Promise<Paginated<CampaignPublic>> {
  const params = new URLSearchParams();
  if (typeof limit === 'number') params.set('limit', String(limit));
  if (typeof offset === 'number') params.set('offset', String(offset));
  const qs = params.toString();
  const url = `${API_BASE}/public/organizations/${encodeURIComponent(slug)}/campaigns${
    qs ? `?${qs}` : ''
  }`;

  const response = await fetch(url, signal ? { signal } : undefined);
  if (!response.ok) {
    throw new Error('error');
  }
  const body = (await response.json()) as Partial<Paginated<CampaignPublic>> | null;
  const items: CampaignPublic[] = Array.isArray(body?.items) ? body.items : [];
  return {
    items,
    total: typeof body?.total === 'number' ? body.total : items.length,
    limit: typeof body?.limit === 'number' ? body.limit : items.length,
    offset: typeof body?.offset === 'number' ? body.offset : 0,
  };
}

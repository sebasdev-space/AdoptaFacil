import type {
  CampaignAccountabilityReport,
  CampaignPublic,
  Paginated,
} from '@adoptafacil/contracts';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface ListPublicCampaignsParams {
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

/**
 * Consume el portal PÚBLICO de campañas (§M14/M06, RF15): `GET /public/campaigns`
 * (endpoint de @sebastian, sólo activas, columnas públicas). Sin token. La respuesta
 * viene ENVUELTA (`Paginated<CampaignPublic>` = { items, total, limit, offset }).
 *
 * ⚠️ Blindaje anti-regresión (patrón .map de T-028c/T-052): SIEMPRE se normaliza
 * `.items` a `[]` si no es un array, para que ningún consumidor haga `.map` sobre un
 * no-array.
 */
export async function listPublicCampaigns({
  limit,
  offset,
  signal,
}: ListPublicCampaignsParams = {}): Promise<Paginated<CampaignPublic>> {
  const params = new URLSearchParams();
  if (typeof limit === 'number') params.set('limit', String(limit));
  if (typeof offset === 'number') params.set('offset', String(offset));
  const qs = params.toString();
  const url = `${API_BASE}/public/campaigns${qs ? `?${qs}` : ''}`;

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

/** Detalle público de una campaña por id, o `null` si no existe (404). */
export async function getPublicCampaign(
  id: string,
  signal?: AbortSignal,
): Promise<CampaignPublic | null> {
  const url = `${API_BASE}/public/campaigns/${encodeURIComponent(id)}`;
  const response = await fetch(url, signal ? { signal } : undefined);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('error');
  return (await response.json()) as CampaignPublic;
}

/**
 * Reporte PÚBLICO de rendición de cuentas de una campaña (RF16 · T-054):
 * `GET /public/campaigns/:id/accountability` (columnas públicas: evidencias +
 * suma de gasto declarado). Sin token. `null` si la campaña no existe o está
 * cancelada (404).
 *
 * ⚠️ Blindaje anti-regresión: SIEMPRE se normaliza `.evidences` a `[]` si no es
 * un array, para que ningún consumidor haga `.map` sobre un no-array.
 */
export async function getCampaignAccountability(
  id: string,
  signal?: AbortSignal,
): Promise<CampaignAccountabilityReport | null> {
  const url = `${API_BASE}/public/campaigns/${encodeURIComponent(id)}/accountability`;
  const response = await fetch(url, signal ? { signal } : undefined);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('error');
  const body = (await response.json()) as CampaignAccountabilityReport;
  return {
    ...body,
    evidences: Array.isArray(body?.evidences) ? body.evidences : [],
    totalSpent: typeof body?.totalSpent === 'number' ? body.totalSpent : 0,
  };
}

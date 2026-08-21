import type { ResourceNeedPublic, ResourceNeedsPage } from '@adoptafacil/contracts';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface ListPublicNeedsParams {
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

/**
 * Consume el catálogo PÚBLICO de necesidades (M09): `GET /public/resources/needs`
 * (solo necesidades que aún aceptan ayuda, columnas públicas). Sin token.
 *
 * ⚠️ Blindaje anti-regresión (mismo patrón que `public-campaigns.ts`): SIEMPRE
 * se normaliza `.items` a `[]` si no es un array.
 */
export async function listPublicNeeds({
  limit,
  offset,
  signal,
}: ListPublicNeedsParams = {}): Promise<ResourceNeedsPage> {
  const params = new URLSearchParams();
  if (typeof limit === 'number') params.set('limit', String(limit));
  if (typeof offset === 'number') params.set('offset', String(offset));
  const qs = params.toString();
  const url = `${API_BASE}/public/resources/needs${qs ? `?${qs}` : ''}`;

  const response = await fetch(url, signal ? { signal } : undefined);
  if (!response.ok) {
    throw new Error('error');
  }
  const body = (await response.json()) as Partial<ResourceNeedsPage> | null;
  const items: ResourceNeedPublic[] = Array.isArray(body?.items) ? body.items : [];
  return {
    items,
    total: typeof body?.total === 'number' ? body.total : items.length,
    limit: typeof body?.limit === 'number' ? body.limit : items.length,
    offset: typeof body?.offset === 'number' ? body.offset : 0,
  };
}

/** Detalle público de una necesidad por id, o `null` si no existe (404). */
export async function getPublicNeed(
  id: string,
  signal?: AbortSignal,
): Promise<ResourceNeedPublic | null> {
  const url = `${API_BASE}/public/resources/needs/${encodeURIComponent(id)}`;
  const response = await fetch(url, signal ? { signal } : undefined);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('error');
  return (await response.json()) as ResourceNeedPublic;
}

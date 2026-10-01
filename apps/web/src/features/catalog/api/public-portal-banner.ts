import type { PublicPortalBannerPhoto } from '@adoptafacil/contracts';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/**
 * Fotos configuradas del banner del portal general (`GET /public/portal-banner`,
 * sin token). Devuelve SOLO entradas válidas (id/imageUrl/altText strings), a lo
 * sumo 4; ante cualquier forma inesperada devuelve `[]` para que el hero use su
 * fallback de íconos. Lanza solo si la petición falla (el consumidor hace fallback).
 */
export async function fetchPortalBanner(signal?: AbortSignal): Promise<PublicPortalBannerPhoto[]> {
  const response = await fetch(`${API_BASE}/public/portal-banner`, signal ? { signal } : undefined);
  if (!response.ok) {
    throw new Error('error');
  }
  const body = (await response.json()) as { items?: unknown } | null;
  const items = Array.isArray(body?.items) ? body.items : [];
  return items
    .filter(
      (item): item is PublicPortalBannerPhoto =>
        !!item &&
        typeof (item as PublicPortalBannerPhoto).id === 'string' &&
        typeof (item as PublicPortalBannerPhoto).imageUrl === 'string' &&
        typeof (item as PublicPortalBannerPhoto).altText === 'string',
    )
    .slice(0, 4);
}

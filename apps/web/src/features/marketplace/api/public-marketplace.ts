import type { ProductCategory, ProductPublic, ProductsPublicPage } from '@adoptafacil/contracts';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface ListPublicProductsParams {
  category?: ProductCategory;
  organizationId?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

/**
 * Consume el catálogo PÚBLICO del marketplace (M10): `GET
 * /public/marketplace/products` (solo productos activos, columnas públicas).
 * Sin token.
 *
 * ⚠️ Blindaje anti-regresión (mismo patrón que `public-campaigns.ts`/
 * `public-resources.ts`): SIEMPRE se normaliza `.items` a `[]` si no es un
 * array.
 */
export async function listPublicProducts({
  category,
  organizationId,
  limit,
  offset,
  signal,
}: ListPublicProductsParams = {}): Promise<ProductsPublicPage> {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (organizationId) params.set('organizationId', organizationId);
  if (typeof limit === 'number') params.set('limit', String(limit));
  if (typeof offset === 'number') params.set('offset', String(offset));
  const qs = params.toString();
  const url = `${API_BASE}/public/marketplace/products${qs ? `?${qs}` : ''}`;

  const response = await fetch(url, signal ? { signal } : undefined);
  if (!response.ok) {
    throw new Error('error');
  }
  const body = (await response.json()) as Partial<ProductsPublicPage> | null;
  const items: ProductPublic[] = Array.isArray(body?.items) ? body.items : [];
  return {
    items,
    total: typeof body?.total === 'number' ? body.total : items.length,
    limit: typeof body?.limit === 'number' ? body.limit : items.length,
    offset: typeof body?.offset === 'number' ? body.offset : 0,
  };
}

/** Detalle público de un producto por id, o `null` si no existe/está inactivo (404). */
export async function getPublicProduct(
  id: string,
  signal?: AbortSignal,
): Promise<ProductPublic | null> {
  const url = `${API_BASE}/public/marketplace/products/${encodeURIComponent(id)}`;
  const response = await fetch(url, signal ? { signal } : undefined);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('error');
  return (await response.json()) as ProductPublic;
}

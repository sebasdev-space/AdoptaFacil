import type {
  CreatePublicReviewInput,
  Paginated,
  PublicReview,
  Review,
} from '@adoptafacil/contracts';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/**
 * Reseñas del portal público (§M14/M12, S7-b): `GET /public/organizations/:slug/reviews`
 * (endpoint YA existente, de @sebastian) — sin token. Misma blindaje anti-regresión
 * que `fetchPublicAnimals`: `.items` SIEMPRE normalizado a `[]`.
 */
export async function fetchPublicReviews(
  slug: string,
  limit = 30,
  signal?: AbortSignal,
): Promise<Paginated<PublicReview>> {
  const url = `${API_BASE}/public/organizations/${encodeURIComponent(slug)}/reviews?limit=${limit}`;
  const response = await fetch(url, signal ? { signal } : undefined);
  if (!response.ok) {
    throw new Error('error');
  }
  const body = (await response.json()) as Partial<Paginated<PublicReview>> | null;
  const items: PublicReview[] = Array.isArray(body?.items) ? body.items : [];
  return {
    items,
    total: typeof body?.total === 'number' ? body.total : items.length,
    limit: typeof body?.limit === 'number' ? body.limit : items.length,
    offset: typeof body?.offset === 'number' ? body.offset : 0,
  };
}

/**
 * Botón "Registrar reseña" del portal público (S7-b, pedido del cliente) —
 * `POST /public/organizations/:slug/reviews`, SIN sesión, siempre anónima.
 * Deliberadamente distinto de `POST /reviews` (RF23 original, exige sesión +
 * interacción real) — este es el único camino que el cliente pidió para el
 * portal público.
 */
export async function submitPublicReview(
  slug: string,
  input: CreatePublicReviewInput,
): Promise<Review> {
  const response = await fetch(
    `${API_BASE}/public/organizations/${encodeURIComponent(slug)}/reviews`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? 'No se pudo enviar la reseña.');
  }
  return response.json() as Promise<Review>;
}

import type { OrganizationSlugLookup } from '@adoptafacil/contracts';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/**
 * Resolves a real portal subdomain to its organization slug (F-1, M14) via
 * `GET /public/organizations/by-subdomain/:subdomain` (no auth). Returns
 * `null` when no organization has that subdomain configured — the caller
 * decides what "not found" looks like; this function never throws for a
 * plain 404 (only for a genuine network/server error).
 */
export async function fetchOrganizationSlugBySubdomain(subdomain: string): Promise<string | null> {
  const response = await fetch(
    `${API_BASE}/public/organizations/by-subdomain/${encodeURIComponent(subdomain)}`,
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('error');
  const body = (await response.json()) as Partial<OrganizationSlugLookup> | null;
  return typeof body?.slug === 'string' ? body.slug : null;
}

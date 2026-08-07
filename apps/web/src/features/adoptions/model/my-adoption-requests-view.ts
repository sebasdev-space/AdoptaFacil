import type { AdoptionRequest } from '@adoptafacil/contracts';

/**
 * View-model de "Mis solicitudes" (F1-01). `GET /adoptions/mine` devuelve un
 * array DIRECTO de `AdoptionRequest[]` (sin envoltorio `{ items }`) — mismo
 * shape que `GET /donations/mine` (T-064/S1-02), confirmado leyendo
 * `AdoptionsService.listMine`/`adoption_requests_for_applicant`, sin
 * interceptor global de respuesta. `normalizeMine` igual defiende contra una
 * forma inesperada: nunca `.map()` sobre algo que no sea array.
 */
export function normalizeMine(body: unknown): AdoptionRequest[] {
  return Array.isArray(body) ? body : [];
}

/**
 * Etiqueta de la organización dueña del animal. A diferencia de `Donation`
 * (que solo trae `organizationId`, sin nombre — gap real y documentado en
 * `my-donations-view.ts`), `AdoptionRequest.organizationName` SÍ lo resuelve
 * `GET /adoptions/mine` (F1-01, batch anti-N+1). El id truncado queda solo
 * como fallback defensivo (p. ej. una org borrada) — nunca la ruta normal.
 */
export function organizationLabel(
  request: Pick<AdoptionRequest, 'organizationId' | 'organizationName'>,
): string {
  return request.organizationName ?? `Organización #${request.organizationId.slice(0, 8)}`;
}

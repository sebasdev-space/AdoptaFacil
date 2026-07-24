import type {
  AdoptionRequest,
  CreateAdoptionRequestInput,
  TransitionAdoptionRequestInput,
} from '@adoptafacil/contracts';
import type { ApiClient } from '../../../shell/api';

/**
 * Typed wrappers over the shell {@link ApiClient} for M04 (T-028a). The client
 * attaches the access token and handles refresh; feature code stays declarative.
 * Shapes come straight from `@adoptafacil/contracts` — nothing is redefined here.
 */

/** Org kanban: the caller organization's adoption requests (RLS-scoped). */
export function listAdoptionRequests(client: ApiClient): Promise<AdoptionRequest[]> {
  return client.request<AdoptionRequest[]>('/adoptions');
}

/** Person applies to adopt an animal (authenticated). */
export function createAdoptionRequest(
  client: ApiClient,
  input: CreateAdoptionRequestInput,
): Promise<AdoptionRequest> {
  return client.request<AdoptionRequest>('/adoptions', { method: 'POST', json: input });
}

/** Org moves a request through the evaluation state machine (audited server-side). */
export function transitionAdoptionRequest(
  client: ApiClient,
  id: string,
  input: TransitionAdoptionRequestInput,
): Promise<AdoptionRequest> {
  return client.request<AdoptionRequest>(`/adoptions/${id}/transitions`, {
    method: 'POST',
    json: input,
  });
}

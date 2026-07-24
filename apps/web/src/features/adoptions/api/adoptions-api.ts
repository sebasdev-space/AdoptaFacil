import type {
  AdoptionContract,
  AdoptionRequest,
  CreateAdoptionRequestInput,
  GenerateAdoptionContractInput,
  SignAdoptionContractInput,
  TransitionAdoptionContractInput,
  TransitionAdoptionRequestInput,
} from '@adoptafacil/contracts';
import { ApiError, type ApiClient } from '../../../shell/api';

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

// --- T-028b · contract + signature -----------------------------------------

/** Org generates the contract for an approved request (RF11). */
export function generateAdoptionContract(
  client: ApiClient,
  input: GenerateAdoptionContractInput,
): Promise<AdoptionContract> {
  return client.request<AdoptionContract>('/adoptions/contracts', { method: 'POST', json: input });
}

/**
 * Org fetches the contract of a request, or `null` when none exists yet (404).
 * Lets the kanban decide between "generate" and "manage/sign".
 */
export async function getContractForRequest(
  client: ApiClient,
  requestId: string,
): Promise<AdoptionContract | null> {
  try {
    return await client.request<AdoptionContract>(`/adoptions/contracts/by-request/${requestId}`);
  } catch (error) {
    if (ApiError.is(error) && error.status === 404) return null;
    throw error;
  }
}

/** A signer fetches the contract they must sign (org rep or adopter). */
export function getContractForSigner(
  client: ApiClient,
  contractId: string,
): Promise<AdoptionContract> {
  return client.request<AdoptionContract>(`/adoptions/contracts/${contractId}`);
}

/** Org moves the contract between managed states (draft→pending, cancel). */
export function transitionAdoptionContract(
  client: ApiClient,
  contractId: string,
  input: TransitionAdoptionContractInput,
): Promise<AdoptionContract> {
  return client.request<AdoptionContract>(`/adoptions/contracts/${contractId}/transitions`, {
    method: 'POST',
    json: input,
  });
}

/** A signer signs their part via the simulable SignaturePort (server-side). */
export function signAdoptionContract(
  client: ApiClient,
  contractId: string,
  input: SignAdoptionContractInput,
): Promise<AdoptionContract> {
  return client.request<AdoptionContract>(`/adoptions/contracts/${contractId}/signatures`, {
    method: 'POST',
    json: input,
  });
}

import type {
  AdoptionContract,
  AdoptionFollowUpMilestone,
  AdoptionRequest,
  CreateAdoptionRequestInput,
  GenerateAdoptionContractInput,
  ScheduleFollowUpMilestoneInput,
  SignAdoptionContractInput,
  SubmitFollowUpInput,
  TransitionAdoptionContractInput,
  TransitionAdoptionRequestInput,
  UpdateAdoptionContractDataInput,
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

/** F1-01 — the applicant's own requests (cross-tenant, by identity). */
export function listMyAdoptionRequests(client: ApiClient): Promise<AdoptionRequest[]> {
  return client.request<AdoptionRequest[]>('/adoptions/mine');
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

/** The contract detail page for ANY org manager (not just whoever generated
 *  it) — `/adopciones/contratos/:id`. */
export function getContractForOrgById(
  client: ApiClient,
  contractId: string,
): Promise<AdoptionContract> {
  return client.request<AdoptionContract>(`/adoptions/contracts/org/${contractId}`);
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

/** A signer signs their part. The org representative needs no image (reuses
 *  the already-registered legal representative signature); the adopter MUST
 *  include `signatureBase64` (drawn/uploaded via `SignaturePad`). */
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

/** Org edits the fillable data (peso, estado de salud, etc.) while the
 *  contract is still a draft with no signatures yet. */
export function updateAdoptionContractData(
  client: ApiClient,
  contractId: string,
  input: UpdateAdoptionContractDataInput,
): Promise<AdoptionContract> {
  return client.request<AdoptionContract>(`/adoptions/contracts/${contractId}/data`, {
    method: 'PATCH',
    json: input,
  });
}

/** Download the contract as a real PDF and trigger a browser save — any
 *  legitimate signer, at any status (lets the org preview the draft). */
export async function downloadAdoptionContractPdf(
  client: ApiClient,
  contractId: string,
): Promise<void> {
  const blob = await client.requestBlob(`/adoptions/contracts/${contractId}/pdf`);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `contrato-adopcion-${contractId}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// --- T-028c · post-adoption follow-up ---------------------------------------

/** Org schedules a follow-up milestone on a signed contract (RF12). */
export function scheduleFollowUpMilestone(
  client: ApiClient,
  input: ScheduleFollowUpMilestoneInput,
): Promise<AdoptionFollowUpMilestone> {
  return client.request<AdoptionFollowUpMilestone>('/adoptions/followups', {
    method: 'POST',
    json: input,
  });
}

/** Org lists the follow-up milestones of a contract. */
export function listFollowUpsForContract(
  client: ApiClient,
  contractId: string,
): Promise<AdoptionFollowUpMilestone[]> {
  return client.request<AdoptionFollowUpMilestone[]>(
    `/adoptions/followups/by-contract/${contractId}`,
  );
}

/** The adopter's own follow-up milestones (cross-tenant, by identity). */
export function listMyFollowUps(client: ApiClient): Promise<AdoptionFollowUpMilestone[]> {
  return client.request<AdoptionFollowUpMilestone[]>('/adoptions/followups/mine');
}

/** The adopter responds a milestone (answers and/or a photo via StoragePort). */
export function submitFollowUp(
  client: ApiClient,
  milestoneId: string,
  input: SubmitFollowUpInput,
): Promise<AdoptionFollowUpMilestone> {
  return client.request<AdoptionFollowUpMilestone>(`/adoptions/followups/${milestoneId}/submit`, {
    method: 'POST',
    json: input,
  });
}

/** The org closes (completes) a milestone. */
export function completeFollowUp(
  client: ApiClient,
  milestoneId: string,
): Promise<AdoptionFollowUpMilestone> {
  return client.request<AdoptionFollowUpMilestone>(`/adoptions/followups/${milestoneId}/complete`, {
    method: 'POST',
  });
}

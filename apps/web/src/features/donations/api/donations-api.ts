import type {
  CreateDonationInput,
  Donation,
  DonationReceipt,
  DonationWithReceipt,
} from '@adoptafacil/contracts';
import type { ApiClient } from '../../../shell/api';

/**
 * Typed wrappers over the shell {@link ApiClient} for M05 (T-050). Shapes come
 * straight from `@adoptafacil/contracts`; the client attaches the access token.
 */

/** A person creates a donation (authenticated). */
export function createDonation(client: ApiClient, input: CreateDonationInput): Promise<Donation> {
  return client.request<Donation>('/donations', { method: 'POST', json: input });
}

/** The beneficiary org's received donations with their receipts (org roles). */
export function listReceivedDonations(client: ApiClient): Promise<DonationWithReceipt[]> {
  return client.request<DonationWithReceipt[]>('/donations/received');
}

/** The donor's own donations (cross-tenant, by identity). */
export function listMyDonations(client: ApiClient): Promise<Donation[]> {
  return client.request<Donation[]>('/donations/mine');
}

/** The donor's receipt for THEIR OWN donation. */
export function getMyDonationReceipt(client: ApiClient, id: string): Promise<DonationReceipt> {
  return client.request<DonationReceipt>(`/donations/${id}/receipt`);
}

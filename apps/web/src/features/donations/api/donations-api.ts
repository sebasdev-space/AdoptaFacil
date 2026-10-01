import type {
  CreateDonationInput,
  Donation,
  DonationReceipt,
  DonationWithReceipt,
  GuestDonationAccess,
} from '@adoptafacil/contracts';
import type { ApiClient } from '../../../shell/api';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

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

/**
 * GUEST donation access via the emailed "magic link" — PUBLIC, no session (the
 * token itself is the credential), same fetch convention as
 * `fetchPublicCertificateVerification` (features/certificates). Returns
 * `null` on a 404 (missing/expired/unknown token — never distinguished) so
 * the page can show one honest "not valid" state instead of a thrown error.
 */
export async function fetchGuestDonationAccess(token: string): Promise<GuestDonationAccess | null> {
  const response = await fetch(`${API_BASE}/public/donations/access/${encodeURIComponent(token)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('error');
  return (await response.json()) as GuestDonationAccess;
}

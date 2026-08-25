import type {
  CreateSponsorshipInput,
  Paginated,
  Sponsorship,
  SponsorshipPayment,
  SponsorshipPlan,
  SponsorshipStatusChangeInput,
} from '@adoptafacil/contracts';
import type { ApiClient } from '../../../shell/api';

/**
 * Typed wrappers over the shell {@link ApiClient} for M07 (RF17 · T-056), consumiendo
 * SOLO endpoints ya existentes (S2-03). Shapes come straight from `@adoptafacil/contracts`.
 */

/** Subscribe to a plan (any authenticated Person, no @Roles gate — `POST /sponsorships`). */
export function subscribeToPlan(
  client: ApiClient,
  input: CreateSponsorshipInput,
): Promise<Sponsorship> {
  return client.request<Sponsorship>('/sponsorships', { method: 'POST', json: input });
}

/** The sponsor's (padrino) own sponsorships — "mis apadrinamientos" (`GET /sponsorships/mine`). */
export function listMySponsorships(client: ApiClient): Promise<Sponsorship[]> {
  return client.request<Sponsorship[]>('/sponsorships/mine');
}

/** The org's received sponsorships (Owner/Administrator/ReadOnlyAuditor — `GET /sponsorships`). */
export function listOrgSponsorships(client: ApiClient): Promise<Sponsorship[]> {
  return client
    .request<Partial<Paginated<Sponsorship>>>('/sponsorships?limit=50')
    .then((page) => (Array.isArray(page?.items) ? page.items : []));
}

/** The org's sponsorship plans (Owner/Administrator/ReadOnlyAuditor — `GET /sponsorship-plans`),
 *  used ONLY to resolve plan names for the internal listing (no new endpoint). */
export function listOrgPlans(client: ApiClient): Promise<SponsorshipPlan[]> {
  return client
    .request<Partial<Paginated<SponsorshipPlan>>>('/sponsorship-plans?limit=50')
    .then((page) => (Array.isArray(page?.items) ? page.items : []));
}

/** Suspend a sponsorship (Owner/Administrator — `POST /sponsorships/:id/suspend`). */
export function suspendSponsorship(
  client: ApiClient,
  id: string,
  dto: SponsorshipStatusChangeInput = {},
): Promise<Sponsorship> {
  return client.request<Sponsorship>(`/sponsorships/${id}/suspend`, {
    method: 'POST',
    json: dto,
  });
}

/** Reactivate a sponsorship (Owner/Administrator — `POST /sponsorships/:id/reactivate`). */
export function reactivateSponsorship(
  client: ApiClient,
  id: string,
  dto: SponsorshipStatusChangeInput = {},
): Promise<Sponsorship> {
  return client.request<Sponsorship>(`/sponsorships/${id}/reactivate`, {
    method: 'POST',
    json: dto,
  });
}

/** Cancel a sponsorship — terminal, no reactivation after (Owner/Administrator —
 *  `POST /sponsorships/:id/cancel`). S2-03-REV: this action existed in the
 *  backend since the original S2-03 slice but had no frontend consumer. */
export function cancelSponsorship(
  client: ApiClient,
  id: string,
  dto: SponsorshipStatusChangeInput = {},
): Promise<Sponsorship> {
  return client.request<Sponsorship>(`/sponsorships/${id}/cancel`, {
    method: 'POST',
    json: dto,
  });
}

/** Recurring-billing ledger of one sponsorship (S-5-REDISEÑO —
 *  Owner/Administrator/ReadOnlyAuditor, `GET /sponsorships/:id/payments`). */
export function getSponsorshipPayments(
  client: ApiClient,
  id: string,
): Promise<SponsorshipPayment[]> {
  return client.request<SponsorshipPayment[]>(`/sponsorships/${id}/payments`);
}

/** Sponsor-initiated recovery after auto-suspension by billing failure
 *  (S-5-REDISEÑO Objetivo 6 — any authenticated Person, no @Roles gate,
 *  `POST /sponsorships/:id/retry-payment`). The backend rejects it (400/404)
 *  if the caller is not the sponsor or the suspension was not billing-related. */
export function retrySponsorshipPayment(
  client: ApiClient,
  id: string,
): Promise<SponsorshipPayment> {
  return client.request<SponsorshipPayment>(`/sponsorships/${id}/retry-payment`, {
    method: 'POST',
  });
}

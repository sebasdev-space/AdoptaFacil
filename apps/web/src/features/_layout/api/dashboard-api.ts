import type { OrganizationDashboardSummary } from '@adoptafacil/contracts';
import type { ApiClient } from '../../../shell/api';

/**
 * Minimal organization summary for the "Inicio" dashboard (S2-08, M13) —
 * Owner/Administrator/Operator only (`GET /org/summary`, backend `VIEW_ROLES`).
 */
export function fetchOrgSummary(client: ApiClient): Promise<OrganizationDashboardSummary> {
  return client.request<OrganizationDashboardSummary>('/org/summary');
}

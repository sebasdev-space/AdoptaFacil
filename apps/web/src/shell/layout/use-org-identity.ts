import { useEffect, useState } from 'react';
import type { Organization } from '@adoptafacil/contracts';
import { useApiClient } from '../api';
import { useSession } from '../auth';

export type OrgIdentityState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; name: string; logoUrl?: string }
  | { status: 'error' };

/**
 * The current organization's real display name, for the sidebar identity
 * chip (REFACTOR-VISUAL v2, Fase 3 — mockup shows "Huellas de Vida" there,
 * never a placeholder). `GET /org/profile` is "any authenticated member" —
 * no `@Roles` guard — so this loads for every org role, not just Owner.
 * `idle` for a Persona session (no organization to name).
 */
export function useOrgIdentity(): OrgIdentityState {
  const { user } = useSession();
  const client = useApiClient();
  const isOrg = user?.accountType === 'organization';
  const [state, setState] = useState<OrgIdentityState>(
    isOrg ? { status: 'loading' } : { status: 'idle' },
  );

  useEffect(() => {
    if (!isOrg) {
      setState({ status: 'idle' });
      return;
    }
    let active = true;
    setState({ status: 'loading' });
    client
      .request<Partial<Organization> | null>('/org/profile')
      .then((org) => {
        if (!active) return;
        // Defensive: an unexpected/empty body (e.g. a test's generic mock)
        // becomes an error state, never a crash on `undefined.split(...)`.
        if (org && typeof org.name === 'string' && org.name.trim()) {
          setState({
            status: 'ready',
            name: org.name,
            logoUrl:
              typeof org.logoUrl === 'string' && org.logoUrl.trim() ? org.logoUrl : undefined,
          });
        } else {
          setState({ status: 'error' });
        }
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [isOrg, client]);

  return state;
}

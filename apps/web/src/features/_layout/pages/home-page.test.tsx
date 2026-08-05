import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { SessionProvider } from '../../../shell/auth';
import { HomePage } from './home-page';

/**
 * F-VISUAL-02 — the "Estado del sistema" block (raw `/health`, db/redis
 * wording) is internal/technical and must stay invisible to a Persona or Org
 * user; only a platform admin (PlatformAdmin/PlatformSuperAdmin) sees it. The
 * gate reuses the session's `hasAnyRole` (same mechanism as every other
 * guarded surface, T-025) and skips the `/health` fetch entirely for anyone
 * else — not just hides the result.
 */
function renderHome(roles: Role[]) {
  return render(
    <SessionProvider
      initialStatus="authenticated"
      initialUser={{
        id: 'u1',
        name: 'Tester',
        email: 'tester@example.test',
        roles,
        organizationId: 'org-1',
        accountType: roles.length ? 'organization' : 'person',
      }}
    >
      <HomePage />
    </SessionProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', db: 'up', redis: 'up' }),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HomePage — system-health block is platform-admin only (F-VISUAL-02)', () => {
  it('hides the block from a Persona (no roles) and never fetches /health', async () => {
    renderHome([]);
    expect(screen.getByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
    expect(screen.queryByText('Estado del sistema')).not.toBeInTheDocument();
    // Give any stray effect a tick, then assert the fetch never fired.
    await waitFor(() => expect(fetch).not.toHaveBeenCalled());
  });

  it('hides the block from an org role that is NOT a platform admin', async () => {
    renderHome([Role.Owner]);
    expect(screen.getByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
    expect(screen.queryByText('Estado del sistema')).not.toBeInTheDocument();
    await waitFor(() => expect(fetch).not.toHaveBeenCalled());
  });

  it('shows the block with real data for a PlatformAdmin', async () => {
    renderHome([Role.PlatformAdmin]);
    expect(screen.getByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
    expect(screen.getByText('Estado del sistema')).toBeInTheDocument();
    expect(await screen.findByText('status')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('shows the block for a PlatformSuperAdmin too', async () => {
    renderHome([Role.PlatformSuperAdmin]);
    expect(screen.getByText('Estado del sistema')).toBeInTheDocument();
    expect(await screen.findByText('status')).toBeInTheDocument();
  });
});

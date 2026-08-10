import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { SessionProvider } from '../../../shell/auth';
import { HomePage } from './home-page';

const ORG_SUMMARY_BODY = {
  animalsActive: 45,
  adoptionRequestsPending: 6,
  sponsorshipsActive: 9,
  documentsExpiringSoon: 1,
  documentsRejected: 2,
  donationsReceivedTotal: 1240000,
  formalizationLevel: 3,
  formalizationPercent: 60,
};

/**
 * F-VISUAL-02 — the "Estado del sistema" block (raw `/health`, db/redis
 * wording) is internal/technical and must stay invisible to a Persona or Org
 * user; only a platform admin (PlatformAdmin/PlatformSuperAdmin) sees it.
 * S2-08 — the org summary block (`GET /org/summary`) is the mirror image:
 * only Owner/Administrator/Operator see it, matching the backend's
 * `VIEW_ROLES` exactly. Both gates reuse the session's `hasAnyRole` (T-025)
 * and skip their fetch entirely for a role that can't see the block — not
 * just hide the result.
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
    vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('/org/summary')
        ? ORG_SUMMARY_BODY
        : { status: 'ok', db: 'up', redis: 'up' };
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => body,
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HomePage — system-health block is platform-admin only (F-VISUAL-02)', () => {
  it('hides both blocks from a Persona (no roles) and fetches nothing', async () => {
    renderHome([]);
    expect(screen.getByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
    expect(screen.queryByText('Estado del sistema')).not.toBeInTheDocument();
    expect(screen.queryByText('Animales activos')).not.toBeInTheDocument();
    // Give any stray effect a tick, then assert the fetch never fired.
    await waitFor(() => expect(fetch).not.toHaveBeenCalled());
  });

  it('hides the health block from an org role that is NOT a platform admin', async () => {
    renderHome([Role.Owner]);
    expect(screen.getByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
    expect(screen.queryByText('Estado del sistema')).not.toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('/org/summary');
  });

  it('shows the block with real data for a PlatformAdmin', async () => {
    renderHome([Role.PlatformAdmin]);
    expect(screen.getByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
    expect(screen.getByText('Estado del sistema')).toBeInTheDocument();
    expect(await screen.findByText('status')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Animales activos')).not.toBeInTheDocument();
  });

  it('shows the block for a PlatformSuperAdmin too', async () => {
    renderHome([Role.PlatformSuperAdmin]);
    expect(screen.getByText('Estado del sistema')).toBeInTheDocument();
    expect(await screen.findByText('status')).toBeInTheDocument();
  });
});

describe('HomePage — org summary block is Owner/Administrator/Operator only (S2-08)', () => {
  it('renders real stat cards for an Owner', async () => {
    renderHome([Role.Owner]);
    expect(await screen.findByText('Animales activos')).toBeInTheDocument();
    expect(screen.getByText('45')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('Nivel 3')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('Revisar')).toBeInTheDocument();
    expect(screen.getByText('Subsanar')).toBeInTheDocument();
  });

  it('hides the block for a Volunteer (org role, but outside VIEW_ROLES)', async () => {
    renderHome([Role.Volunteer]);
    expect(screen.getByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
    expect(screen.queryByText('Animales activos')).not.toBeInTheDocument();
    await waitFor(() => expect(fetch).not.toHaveBeenCalled());
  });

  it('shows a retry affordance when the summary fetch fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: async () => ({}),
    } as never);
    renderHome([Role.Administrator]);
    expect(await screen.findByText('No se pudo cargar el resumen.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

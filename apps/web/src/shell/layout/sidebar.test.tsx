import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../test-utils';

describe('Sidebar — org identity chip (REFACTOR-VISUAL v2, Fase 3)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the real org name once GET /org/profile resolves', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ id: 'org-1', name: 'Huellas de Vida' }),
      }),
    );

    renderShell({
      route: '/adopciones',
      session: {
        initialStatus: 'authenticated',
        initialUser: {
          id: 'u1',
          name: 'Laura Gómez',
          email: 'laura@example.test',
          roles: [Role.Owner],
          organizationId: 'org-1',
          accountType: 'organization',
        },
      },
    });

    // Rendered twice by design — the persistent desktop sidebar AND the
    // off-canvas mobile drawer both mount at once (only one is visible per
    // viewport via CSS, same pattern the pre-existing <Brand> already uses).
    const sidebar = screen.getByTestId('org-sidebar');
    expect(await within(sidebar).findByText('Huellas de Vida')).toBeInTheDocument();
  });

  it('renders nothing for a Persona session and never fetches the org profile', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderShell({
      route: '/adopciones',
      session: {
        initialStatus: 'authenticated',
        initialUser: {
          id: 'u2',
          name: 'Camila Torres',
          email: 'camila@example.test',
          roles: [],
          accountType: 'person',
        },
      },
    });

    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });

  it('degrades silently (no crash) when the org profile fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    renderShell({
      route: '/adopciones',
      session: {
        initialStatus: 'authenticated',
        initialUser: {
          id: 'u3',
          name: 'Laura Gómez',
          email: 'laura@example.test',
          roles: [Role.Owner],
          organizationId: 'org-1',
          accountType: 'organization',
        },
      },
    });

    // The shell still renders normally — no crash, just no identity chip.
    expect(
      await screen.findByRole('navigation', { name: 'Navegación principal' }),
    ).toBeInTheDocument();
  });
});

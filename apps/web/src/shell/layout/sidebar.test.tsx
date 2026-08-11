import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../test-utils';

function sessionWith(roles: Role[]) {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'u1',
        name: 'Tester',
        email: 'tester@example.test',
        roles,
        organizationId: 'org-1',
        accountType: 'organization' as const,
      },
    },
  };
}

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

  it('MENU-SUBMENUS: the identity block links to "Mi organización" (replaces the removed nav entry)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ id: 'org-1', name: 'Huellas de Vida' }),
      }),
    );

    renderShell({ route: '/adopciones', ...sessionWith([Role.Owner]) });

    const sidebar = screen.getByTestId('org-sidebar');
    const identityLink = await within(sidebar).findByRole('link', { name: /Huellas de Vida/ });
    expect(identityLink).toHaveAttribute('href', '/organizacion');
  });
});

describe('Sidebar — MENU-SUBMENUS collapsible groups', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubGenericFetch() {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => [],
      }),
    );
  }

  it('"Donaciones" starts collapsed, expands on click revealing both children, and collapses again', async () => {
    stubGenericFetch();
    renderShell({ route: '/inicio', ...sessionWith([Role.Owner]) });

    const sidebar = screen.getByTestId('org-sidebar');
    const toggle = await within(sidebar).findByRole('button', { name: 'Donaciones' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(sidebar).queryByRole('link', { name: 'Mis donaciones' })).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(sidebar).getByRole('link', { name: 'Mis donaciones' })).toHaveAttribute(
      'href',
      '/donaciones',
    );
    expect(within(sidebar).getByRole('link', { name: 'Donaciones recibidas' })).toHaveAttribute(
      'href',
      '/donaciones-recibidas',
    );

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(sidebar).queryByRole('link', { name: 'Mis donaciones' })).not.toBeInTheDocument();
  });

  it('auto-expands "Apadrinamientos" and marks the active child when its route is current', async () => {
    stubGenericFetch();
    renderShell({ route: '/organizacion/apadrinamientos', ...sessionWith([Role.Owner]) });

    const sidebar = screen.getByTestId('org-sidebar');
    const toggle = await within(sidebar).findByRole('button', { name: 'Apadrinamientos' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(
      within(sidebar).getByRole('link', { name: 'Apadrinamientos recibidos' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('"Documentos": the label navigates to the real module; the chevron only expands/collapses the "Pronto" children', async () => {
    stubGenericFetch();
    renderShell({ route: '/inicio', ...sessionWith([Role.Owner]) });

    const sidebar = screen.getByTestId('org-sidebar');
    const link = await within(sidebar).findByRole('link', { name: 'Documentos' });
    expect(link).toHaveAttribute('href', '/organizacion/documentos');

    const chevron = within(sidebar).getByRole('button', { name: 'Expandir Documentos' });
    expect(chevron).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(chevron);

    expect(chevron).toHaveAttribute('aria-expanded', 'true');
    expect(within(sidebar).getByRole('link', { name: /Transparencia nacional/ })).toHaveAttribute(
      'href',
      '/organizacion/transparencia-nacional',
    );
    expect(within(sidebar).getByRole('link', { name: /Reporte exógeno 2575/ })).toHaveAttribute(
      'href',
      '/organizacion/reporte-exogeno',
    );
    // The label link itself is untouched by the chevron toggle.
    expect(link).toHaveAttribute('href', '/organizacion/documentos');
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../test-utils';

/**
 * T-031 — the shell wires M01/M03's already-built surfaces (documents, animals,
 * clinical panel, reminders, platform review) as navigable, role-gated routes.
 *
 * The DOUBLE BARRIER is what matters: a user without the endpoint's role (a) never
 * sees the menu entry AND (b) is denied even on a direct URL hit — including the
 * deny-by-default case where roles failed to load (roles: []). This is 100%
 * frontend wiring (no new endpoints), so the `rls-no-leak` gate does not apply.
 */
function sessionWith(roles: Role[]) {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'u1',
        name: 'Tester',
        email: 'tester@refugio.org',
        roles,
        organizationId: 'org-1',
        accountType: 'organization' as const,
      },
    },
  };
}

// Every wired page fetches on mount; stub fetch so the shell renders offline.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => [],
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

/** Each surface: its route, a heading proving it rendered, and its allowed role. */
const SURFACES = [
  {
    name: 'documentos de organización',
    route: '/organizacion/documentos',
    heading: 'Documentos',
    allow: Role.Owner,
  },
  { name: 'animales', route: '/animales', heading: 'Animales', allow: Role.Operator },
  {
    name: 'expediente clínico (panel embebido)',
    route: '/animales/an-1',
    heading: 'Detalle del animal',
    allow: Role.Veterinarian,
  },
  {
    name: 'recordatorios',
    route: '/recordatorios',
    heading: 'Recordatorios',
    allow: Role.Operator,
  },
  {
    name: 'revisión de plataforma',
    route: '/plataforma/documentos',
    heading: 'Revisión de documentos',
    allow: Role.PlatformAdmin,
  },
] as const;

describe('T-031 · route guards (deny-by-default)', () => {
  for (const s of SURFACES) {
    it(`renders ${s.name} for an allowed role`, async () => {
      renderShell({ route: s.route, ...sessionWith([s.allow]) });
      expect(await screen.findByRole('heading', { name: s.heading })).toBeInTheDocument();
    });

    it(`denies ${s.name} to a role without access (direct URL)`, async () => {
      // A role that is never in any of these surfaces' allow-lists.
      renderShell({ route: s.route, ...sessionWith([Role.TemporaryCollaborator]) });
      expect(await screen.findByText('Sin acceso')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: s.heading })).not.toBeInTheDocument();
    });

    it(`denies ${s.name} when roles are empty (degraded fetch)`, async () => {
      renderShell({ route: s.route, ...sessionWith([]) });
      expect(await screen.findByText('Sin acceso')).toBeInTheDocument();
    });
  }

  it('denies the platform review surface to an ORG Owner (platform audience only)', async () => {
    renderShell({ route: '/plataforma/documentos', ...sessionWith([Role.Owner]) });
    expect(await screen.findByText('Sin acceso')).toBeInTheDocument();
  });
});

describe('T-031 · menu reflects the role (first barrier)', () => {
  /** The desktop sidebar nav; the mobile drawer is aria-hidden and excluded. */
  function nav() {
    return screen.getByRole('navigation', { name: 'Navegación principal' });
  }

  it('shows the org animal/document entries to an org role, hides platform review', async () => {
    renderShell({ route: '/', ...sessionWith([Role.Owner]) });
    await waitFor(() =>
      expect(within(nav()).getByRole('link', { name: 'Animales' })).toBeInTheDocument(),
    );
    expect(within(nav()).getByRole('link', { name: 'Documentos' })).toBeInTheDocument();
    expect(within(nav()).getByRole('link', { name: 'Recordatorios' })).toBeInTheDocument();
    expect(
      within(nav()).queryByRole('link', { name: 'Revisión de documentos' }),
    ).not.toBeInTheDocument();
  });

  it('shows platform review to a platform admin, hides the org-only entries', async () => {
    renderShell({ route: '/', ...sessionWith([Role.PlatformAdmin]) });
    await waitFor(() =>
      expect(
        within(nav()).getByRole('link', { name: 'Revisión de documentos' }),
      ).toBeInTheDocument(),
    );
    expect(within(nav()).queryByRole('link', { name: 'Animales' })).not.toBeInTheDocument();
    expect(within(nav()).queryByRole('link', { name: 'Documentos' })).not.toBeInTheDocument();
  });

  it('hides every role-gated entry when the session has no roles (deny-by-default)', async () => {
    renderShell({ route: '/', ...sessionWith([]) });
    // Ungated entries stay visible…
    await waitFor(() =>
      expect(within(nav()).getByRole('link', { name: 'Adopciones' })).toBeInTheDocument(),
    );
    // …role-gated ones do not.
    expect(within(nav()).queryByRole('link', { name: 'Animales' })).not.toBeInTheDocument();
    expect(within(nav()).queryByRole('link', { name: 'Documentos' })).not.toBeInTheDocument();
    expect(
      within(nav()).queryByRole('link', { name: 'Revisión de documentos' }),
    ).not.toBeInTheDocument();
  });
});

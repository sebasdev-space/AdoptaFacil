import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../test-utils';

/**
 * T-062 — fix the §13 UX gap: "Mi organización" / "Formalización" /
 * "Personalización" / "Transparencia" had NO role gate at all (visible/reachable
 * by ANY authenticated user, including a Persona/donante with zero org roles).
 * They now demand ORG_MEMBER_ROLES (§13's full org-role set) at both barriers —
 * same double-barrier pattern as T-031 (menu entry + route guard).
 *
 * T-063 — same fix for the "Campañas" MENU ENTRY only: a donor reaches the public
 * campaigns portal (/campanas, T-055) from an org's public portal (/o/:slug), not
 * from this sidebar link, so the entry is now ORG_MEMBER_ROLES-gated too. The
 * underlying /campanas ROUTE stays public and untouched (covered separately by
 * routing.test.tsx's "serves /campanas as a PUBLIC campaigns portal without a
 * session") — there is no <RequireRoles> on it, so it is NOT in the SURFACES list
 * below (that list is for routes gated at BOTH barriers).
 */
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
        accountType: roles.length ? ('organization' as const) : ('person' as const),
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

/** Each surface: its route, a heading proving it rendered, and an allowed role. */
const SURFACES = [
  {
    name: 'Mi organización',
    route: '/organizacion',
    heading: 'Mi organización',
    allow: Role.Operator,
  },
  {
    name: 'Formalización',
    route: '/organizacion/formalizacion',
    heading: 'Formalización',
    allow: Role.Owner,
  },
  {
    name: 'Personalización',
    route: '/organizacion/portal',
    heading: 'Personalización del portal',
    allow: Role.ReadOnlyAuditor,
  },
  {
    name: 'Transparencia',
    route: '/transparencia',
    heading: 'Transparencia',
    allow: Role.Volunteer,
  },
] as const;

describe('T-062 · "Mi organización" surfaces demand an org role (deny-by-default)', () => {
  for (const s of SURFACES) {
    it(`renders ${s.name} for an org role (${s.allow})`, async () => {
      renderShell({ route: s.route, ...sessionWith([s.allow]) });
      expect(await screen.findByRole('heading', { name: s.heading })).toBeInTheDocument();
    });

    it(`denies ${s.name} to a Persona (no org role)`, async () => {
      renderShell({ route: s.route, ...sessionWith([]) });
      expect(await screen.findByText('Sin acceso')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: s.heading })).not.toBeInTheDocument();
    });
  }
});

describe('T-062 · sidebar reflects the org gate (first barrier)', () => {
  function nav() {
    return screen.getByRole('navigation', { name: 'Navegación principal' });
  }

  it('shows the org-management entries (incl. Campañas) to an org role', async () => {
    renderShell({ route: '/', ...sessionWith([Role.Owner]) });
    await waitFor(() =>
      expect(within(nav()).getByRole('link', { name: 'Mi organización' })).toBeInTheDocument(),
    );
    expect(within(nav()).getByRole('link', { name: 'Personalización' })).toBeInTheDocument();
    expect(within(nav()).getByRole('link', { name: 'Transparencia' })).toBeInTheDocument();
    expect(within(nav()).getByRole('link', { name: 'Campañas' })).toBeInTheDocument();
  });

  it('hides the org-management entries (incl. Campañas) from a Persona (no org role)', async () => {
    renderShell({ route: '/', ...sessionWith([]) });
    // Ungated entries stay visible…
    await waitFor(() =>
      expect(within(nav()).getByRole('link', { name: 'Donaciones' })).toBeInTheDocument(),
    );
    // …the org-management surfaces do not — a donor reaches campaigns via the
    // org's public portal (/o/:slug → "Campaña activa"), not this menu (T-063).
    expect(within(nav()).queryByRole('link', { name: 'Mi organización' })).not.toBeInTheDocument();
    expect(within(nav()).queryByRole('link', { name: 'Personalización' })).not.toBeInTheDocument();
    expect(within(nav()).queryByRole('link', { name: 'Transparencia' })).not.toBeInTheDocument();
    expect(within(nav()).queryByRole('link', { name: 'Campañas' })).not.toBeInTheDocument();
  });
});

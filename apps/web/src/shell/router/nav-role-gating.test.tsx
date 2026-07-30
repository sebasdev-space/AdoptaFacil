import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../test-utils';

/**
 * T-062 — fix the §13 UX gap: "Mi organización" / "Formalización" /
 * "Personalización" had NO role gate at all (visible/reachable by ANY
 * authenticated user, including a Persona/donante with zero org roles). They
 * now demand ORG_MEMBER_ROLES (§13's full org-role set) at both barriers —
 * same double-barrier pattern as T-031 (menu entry + route guard).
 *
 * T-063 — same fix for the "Campañas" MENU ENTRY: a donor reaches the public
 * campaigns portal (/campanas, T-055) from an org's public portal (/o/:slug),
 * not from this sidebar link.
 *
 * T-065 (pre-demo) — "Campañas" and "Transparencia" are now REMOVED from the
 * menu ENTIRELY (for every role, Owner included), not just gated: for Campañas,
 * clicking it as an Owner landed on the public /campanas route and exited the
 * shell (no sidebar); for Transparencia, the screen was only ever a stale
 * placeholder ("se implementará en la Ola 1..."). Neither is in the SURFACES
 * list below (no heading to render — Transparencia now redirects home, and
 * Campañas' underlying ROUTE stays public/untouched, covered separately by
 * routing.test.tsx's "serves /campanas as a PUBLIC campaigns portal without a
 * session").
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

  it('shows the org-management entries to an org role, but NEVER Campañas/Transparencia (T-065)', async () => {
    renderShell({ route: '/', ...sessionWith([Role.Owner]) });
    await waitFor(() =>
      expect(within(nav()).getByRole('link', { name: 'Mi organización' })).toBeInTheDocument(),
    );
    expect(within(nav()).getByRole('link', { name: 'Personalización' })).toBeInTheDocument();
    // Removed from the menu for EVERY role (T-065) — an Owner clicking either
    // used to be a real problem (Campañas exited the shell; Transparencia showed
    // a stale "Ola 1" placeholder).
    expect(within(nav()).queryByRole('link', { name: 'Transparencia' })).not.toBeInTheDocument();
    expect(within(nav()).queryByRole('link', { name: 'Campañas' })).not.toBeInTheDocument();
  });

  it('hides the org-management entries from a Persona (no org role); Campañas/Transparencia absent too', async () => {
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

describe('T-065 · "Transparencia" route redirects home (no stale "Ola 1" placeholder)', () => {
  it('redirects /transparencia to home for an org role — never shows "en construcción"/"Ola 1"', async () => {
    renderShell({ route: '/transparencia', ...sessionWith([Role.Owner]) });
    // Landed on Home (index route), not the old placeholder.
    expect(
      await screen.findByRole('navigation', { name: 'Navegación principal' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Ola 1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/en construcción/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Transparencia' })).not.toBeInTheDocument();
  });

  it('redirects /transparencia to home for a Persona too', async () => {
    renderShell({ route: '/transparencia', ...sessionWith([]) });
    expect(
      await screen.findByRole('navigation', { name: 'Navegación principal' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Ola 1/)).not.toBeInTheDocument();
  });
});

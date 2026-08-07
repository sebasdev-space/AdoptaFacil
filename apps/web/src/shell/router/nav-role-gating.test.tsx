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
 * T-065 (pre-demo) — "Campañas" and "Transparencia" were REMOVED from the menu
 * entirely (for every role, Owner included): for Campañas, clicking it as an
 * Owner landed on the public /campanas route and exited the shell (no
 * sidebar); for Transparencia, the screen was only ever a stale placeholder
 * ("se implementará en la Ola 1..."). Transparencia stays out (still just a
 * redirect-home, see below).
 *
 * S2-01 — "Campañas" is RESTORED, now pointing at the in-shell management
 * screen (`/organizacion/campanas`) instead of the public portal, gated to
 * CAMPAIGNS_VIEW_ROLES (Owner/Administrator/Operator/ReadOnlyAuditor — copied
 * from CampaignsController's real @Roles). The public route (/campanas) is
 * untouched, covered separately by routing.test.tsx's "serves /campanas as a
 * PUBLIC campaigns portal without a session".
 *
 * S2-04A §4 — "Personalización" is REMOVED from the sidebar (for every role):
 * it's reached from a button inside "Mi organización" now (OrgProfilePage's
 * action bar, S2-01/S2-REORG), not as a top-level nav entry. The ROUTE
 * (`/organizacion/portal`) and its guard are UNCHANGED — the SURFACES table
 * below still exercises it directly by navigating to the route.
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

  it('shows the org-management entries and Campañas to an org role, but NEVER Transparencia (T-065) nor Personalización (S2-04A)', async () => {
    renderShell({ route: '/', ...sessionWith([Role.Owner]) });
    await waitFor(() =>
      expect(within(nav()).getByRole('link', { name: 'Mi organización' })).toBeInTheDocument(),
    );
    // S2-04A §4: "Personalización" left the sidebar — it's a button inside
    // "Mi organización" now, not a top-level nav entry (the route stays; see
    // the SURFACES-driven describe block below).
    expect(within(nav()).queryByRole('link', { name: 'Personalización' })).not.toBeInTheDocument();
    // S2-01: Campañas is back, pointing at the internal management screen.
    expect(within(nav()).getByRole('link', { name: 'Campañas' })).toHaveAttribute(
      'href',
      '/organizacion/campanas',
    );
    // Transparencia stays removed (T-065) — the screen was only ever a stale
    // "Ola 1" placeholder; the real indicator lives in the header bar.
    expect(within(nav()).queryByRole('link', { name: 'Transparencia' })).not.toBeInTheDocument();
  });

  it('hides the org-management entries AND Campañas from a Persona (no org role); Transparencia absent too', async () => {
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

describe('S2-01 · "Campañas" surface demands CAMPAIGNS_VIEW_ROLES (deny-by-default)', () => {
  it('renders the management screen for a write role (Operator)', async () => {
    renderShell({ route: '/organizacion/campanas', ...sessionWith([Role.Operator]) });
    expect(
      await screen.findByRole('heading', { name: 'Campañas de recaudación' }),
    ).toBeInTheDocument();
  });

  it('renders (view-only) for ReadOnlyAuditor', async () => {
    renderShell({ route: '/organizacion/campanas', ...sessionWith([Role.ReadOnlyAuditor]) });
    expect(
      await screen.findByRole('heading', { name: 'Campañas de recaudación' }),
    ).toBeInTheDocument();
  });

  it('denies a role outside CAMPAIGNS_VIEW_ROLES (e.g. Volunteer)', async () => {
    renderShell({ route: '/organizacion/campanas', ...sessionWith([Role.Volunteer]) });
    expect(await screen.findByText('Sin acceso')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Campañas de recaudación' }),
    ).not.toBeInTheDocument();
  });

  it('denies a Persona (no org role)', async () => {
    renderShell({ route: '/organizacion/campanas', ...sessionWith([]) });
    expect(await screen.findByText('Sin acceso')).toBeInTheDocument();
  });
});

describe('F-NAV-ADOPCIONES · "Adopciones" demands ADOPTIONS_MANAGEMENT_ROLES (deny-by-default)', () => {
  function nav() {
    return screen.getByRole('navigation', { name: 'Navegación principal' });
  }

  it('shows "Adopciones" to an evaluation role (Operator), pointing at the kanban', async () => {
    renderShell({ route: '/', ...sessionWith([Role.Operator]) });
    await waitFor(() =>
      expect(within(nav()).getByRole('link', { name: 'Adopciones' })).toHaveAttribute(
        'href',
        '/adopciones',
      ),
    );
  });

  it('hides "Adopciones" from a Persona (no org role) — was visible to everyone before this fix', async () => {
    renderShell({ route: '/', ...sessionWith([]) });
    // An ungated entry stays visible, proving the sidebar actually rendered…
    await waitFor(() =>
      expect(within(nav()).getByRole('link', { name: 'Donaciones' })).toBeInTheDocument(),
    );
    // …while "Adopciones" is gone.
    expect(within(nav()).queryByRole('link', { name: 'Adopciones' })).not.toBeInTheDocument();
  });

  it('hides "Adopciones" from a role outside EVAL_ROLES (e.g. ReadOnlyAuditor — view-only, not an evaluator)', async () => {
    renderShell({ route: '/', ...sessionWith([Role.ReadOnlyAuditor]) });
    await waitFor(() =>
      expect(within(nav()).getByRole('link', { name: 'Mi organización' })).toBeInTheDocument(),
    );
    expect(within(nav()).queryByRole('link', { name: 'Adopciones' })).not.toBeInTheDocument();
  });
});

describe('F1-02 · "/adopciones" route enforces ADOPTIONS_MANAGEMENT_ROLES on a direct URL hit, not just the nav', () => {
  it('denies the evaluation board to a Persona typing the URL directly (403 amigable, not a broken screen)', async () => {
    renderShell({ route: '/adopciones', ...sessionWith([]) });
    expect(await screen.findByText('Sin acceso')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Adopciones' })).not.toBeInTheDocument();
  });

  it('denies the board to an org role outside EVAL_ROLES (ReadOnlyAuditor) on a direct URL hit', async () => {
    renderShell({ route: '/adopciones', ...sessionWith([Role.ReadOnlyAuditor]) });
    expect(await screen.findByText('Sin acceso')).toBeInTheDocument();
  });

  it('renders the evaluation board for an EVAL_ROLES member (Operator)', async () => {
    renderShell({ route: '/adopciones', ...sessionWith([Role.Operator]) });
    expect(await screen.findByRole('heading', { name: 'Adopciones' })).toBeInTheDocument();
  });

  it('leaves "Solicitar adopción" (Persona-facing, POST /adoptions has no @Roles) reachable without an org role', async () => {
    renderShell({ route: '/adopciones/solicitar', ...sessionWith([]) });
    expect(await screen.findByRole('heading', { name: 'Solicitar adopción' })).toBeInTheDocument();
    expect(screen.queryByText('Sin acceso')).not.toBeInTheDocument();
  });

  it('leaves "Donaciones" (Persona-facing, POST /donations has no @Roles) reachable without an org role', async () => {
    renderShell({ route: '/donaciones', ...sessionWith([]) });
    expect(await screen.findByRole('heading', { name: 'Mis donaciones' })).toBeInTheDocument();
    expect(screen.queryByText('Sin acceso')).not.toBeInTheDocument();
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

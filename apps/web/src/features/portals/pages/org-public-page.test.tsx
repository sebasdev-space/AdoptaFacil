import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FormalizationState, type OrganizationPublic } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * Public rich portal `/o/:slug` (§M14, T-026/T-027). The page fetches the org
 * public projection AND its brand theme with bare `fetch` (no auth); tests stub
 * `fetch` per case, routing by URL (the theme endpoint ends with `/theme`).
 */

const ORG: OrganizationPublic = {
  id: 'org-1',
  name: 'Refugio Patitas',
  slug: 'patitas',
  description: 'Rescatamos y damos en adopción animales en Bogotá.',
  contactEmail: 'hola@patitas.org',
  whatsapp: '+57 300 000 0000',
  location: { city: 'Bogotá', department: 'Cundinamarca', country: 'Colombia' },
  socialLinks: { website: 'https://patitas.org' },
  rteVigente: true,
  formalizationState: FormalizationState.Formalizada,
  verificationLevel: { level: 2, criteria: ['identidad'] },
  nit: '900123456-7',
};

interface StubOptions {
  org?: unknown;
  orgStatus?: number;
  orgOk?: boolean;
  theme?: Record<string, unknown>;
}

function stubFetch({ org = ORG, orgStatus = 200, orgOk = true, theme = {} }: StubOptions = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/theme')) {
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ tokens: theme }) });
      }
      return Promise.resolve({ ok: orgOk, status: orgStatus, json: async () => org });
    }),
  );
}

const PUBLIC_SESSION = { session: { initialStatus: 'unauthenticated' as const } };

beforeEach(() => {
  // Default: a valid org. Individual tests override for 404 / error / theme cases.
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OrgPublicPage — rich public portal', () => {
  it('renders the real profile for a valid slug; NO org-type badge when the type is absent', async () => {
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });

    // Profile identity + badges. The projection carries no organizationType (e.g.
    // informal org under the formalized_only policy) → deny-by-default: no badge.
    expect(await screen.findByRole('heading', { name: /Refugio Patitas/ })).toBeInTheDocument();
    expect(screen.queryByTestId('org-type-badge')).not.toBeInTheDocument();
    expect(screen.getByText('RTE vigente')).toBeInTheDocument();
    // The formalization badge + stats row show the STATE label (Formalizada,
    // appears twice), never the verification level — that stays at 0 until the
    // ladder catalog exists (T-103), so it is never surfaced in the UI (T-D02).
    expect(screen.getAllByText('Formalizada').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Verificación nivel/)).not.toBeInTheDocument();
  });

  it('shows the org-type badge with its label when the projection carries the type (T-030)', async () => {
    stubFetch({ org: { ...ORG, organizationType: 'shelter' } });
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });

    await screen.findByRole('heading', { name: /Refugio Patitas/ });
    expect(screen.getByTestId('org-type-badge')).toHaveTextContent('Refugio');
  });

  it('shows a public "Donar" CTA linking to the donation flow with the org resolved (T-051)', async () => {
    // Public portal (unauthenticated): the CTA is visible and points at the donate
    // route carrying the org by query param (the mechanism DonatePage expects). The
    // route's own RequireAuth guard is what enforces sign-in on activation.
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    const cta = screen.getByTestId('portal-donate-cta');
    const href = cta.getAttribute('href') ?? '';
    expect(href).toContain('/donaciones?');
    expect(href).toContain('organizationId=org-1');
    expect(href).toContain('organizationName=Refugio+Patitas');
  });

  it('does NOT mount the still-placeholder aggregated sections (no empty "Próximamente")', async () => {
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    // Pulido visual (T-D02): campaña/necesita hoy/transparencia have NO owning
    // module yet (status stays 'placeholder' forever until one exists) — showing
    // an empty "Próximamente" card in front of the client reads as unfinished, so
    // these sections are simply not mounted. Only 'pets' (LIVE since T-052) shows.
    for (const title of ['Campaña activa', 'Necesita hoy', 'Transparencia']) {
      expect(screen.queryByRole('heading', { name: title })).not.toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { name: 'Mascotas en adopción' })).toBeInTheDocument();
  });

  it('shows the transparency indicator with REAL derived data (§M14, T-027)', async () => {
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    const indicator = screen.getByTestId('transparency-indicator');
    // Nivel real (verificationLevel.level = 2).
    expect(indicator).toHaveTextContent('Nivel');
    expect(indicator).toHaveTextContent('2');
    // % derivado de FORMALIZATION_SEQUENCE: Formalizada = índice 2 / 4 = 50%.
    expect(indicator).toHaveTextContent('50%');
    // Rendición: placeholder honesto hasta M05/M06.
    expect(indicator).toHaveTextContent('No disponible');
    expect(screen.getByText(/Rendición de cuentas: disponible cuando/)).toBeInTheDocument();
  });

  it('applies the org brand tokens at runtime, scoped and safe-subset only', async () => {
    stubFetch({ theme: { primary: '24 90% 45%', radius: '0.5rem', 'font-sans': 'url(evil)' } });
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    const main = screen.getByRole('main');
    // Safe tokens are applied as scoped CSS custom properties…
    expect(main.style.getPropertyValue('--primary')).toBe('24 90% 45%');
    expect(main.style.getPropertyValue('--radius')).toBe('0.5rem');
    // …but a token outside the safe subset is filtered out (never applied).
    expect(main.style.getPropertyValue('--font-sans')).toBe('');
  });

  it('reflects the public contract fields without a duplicated projection', async () => {
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    expect(screen.getByText('hola@patitas.org')).toBeInTheDocument();
    expect(screen.getByText('900123456-7')).toBeInTheDocument();
    expect(screen.getByText('Bogotá, Cundinamarca, Colombia')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sitio web' })).toHaveAttribute(
      'href',
      'https://patitas.org',
    );
  });

  it('omits fields the contract does not expose (e.g. NIT hidden while informal)', async () => {
    const { nit: _nit, socialLinks: _socialLinks, ...informal } = ORG;
    stubFetch({ org: informal });

    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    expect(screen.queryByText('900123456-7')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sitio web' })).not.toBeInTheDocument();
    expect(screen.getByText('hola@patitas.org')).toBeInTheDocument();
  });

  it('renders the hero cover + logo from real URLs when the profile has them (T-D02)', async () => {
    stubFetch({
      org: {
        ...ORG,
        logoUrl: 'https://cdn.test/logo.png',
        coverPhotos: ['https://cdn.test/cover.png'],
      },
    });
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    expect(screen.getByAltText('Logo de Refugio Patitas')).toHaveAttribute(
      'src',
      'https://cdn.test/logo.png',
    );
    // The cover is decorative (alt=""); querying by its known src is the stable seam.
    const cover = document.querySelector('img[src="https://cdn.test/cover.png"]');
    expect(cover).not.toBeNull();
  });

  it('falls back to initials (no logo) when the profile has neither logo nor cover', async () => {
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    // "Refugio Patitas" → initials "RP", never a broken <img>.
    expect(screen.getByText('RP')).toBeInTheDocument();
    expect(screen.queryByAltText(/Logo de/)).not.toBeInTheDocument();
  });

  it('hides the transparency bar when there is no real verification signal (level 0/absent)', async () => {
    const { verificationLevel: _level, ...noLevel } = ORG;
    stubFetch({ org: noLevel });
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    // No fabricated "Nivel 0 · Rendición: No disponible" bar in front of the client.
    expect(screen.queryByTestId('transparency-indicator')).not.toBeInTheDocument();
  });

  it('shows the real animal count in the profile stats row', async () => {
    stubFetch();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/theme')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ tokens: {} }) });
        }
        if (url.includes('/animals')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ items: [], total: 3, limit: 1, offset: 0 }),
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ORG });
      }),
    );
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    expect(await screen.findByText('3 animales disponibles')).toBeInTheDocument();
  });

  it('shows a clear public 404 for an unknown slug', async () => {
    stubFetch({ orgStatus: 404, orgOk: false });

    renderShell({ route: '/o/no-existe', ...PUBLIC_SESSION });

    expect(await screen.findByText('Organización no encontrada')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Refugio Patitas/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mascotas en adopción' })).not.toBeInTheDocument();
  });
});

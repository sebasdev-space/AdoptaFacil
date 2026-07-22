import { screen, within } from '@testing-library/react';
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
  it('renders the real profile (with the reserved org-type badge) for a valid slug', async () => {
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });

    // Profile identity + badges.
    expect(await screen.findByRole('heading', { name: /Refugio Patitas/ })).toBeInTheDocument();
    const typeBadge = screen.getByTestId('org-type-badge');
    expect(typeBadge).toHaveTextContent('Tipo de organización');
    expect(typeBadge).toHaveAttribute('data-reserved', 'true');
    expect(screen.getByText('RTE vigente')).toBeInTheDocument();
    expect(screen.getByText('Verificación nivel 2')).toBeInTheDocument();
  });

  it('renders all four aggregated sections as placeholders with an empty state', async () => {
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    for (const title of [
      'Mascotas en adopción',
      'Campaña activa',
      'Necesita hoy',
      'Transparencia',
    ]) {
      const heading = screen.getByRole('heading', { name: title });
      const section = heading.closest('section');
      expect(section).not.toBeNull();
      expect(within(section as HTMLElement).getByRole('status')).toBeInTheDocument();
      expect(section).toHaveAttribute('data-integration-point');
    }
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

  it('shows a clear public 404 for an unknown slug', async () => {
    stubFetch({ orgStatus: 404, orgOk: false });

    renderShell({ route: '/o/no-existe', ...PUBLIC_SESSION });

    expect(await screen.findByText('Organización no encontrada')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Refugio Patitas/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mascotas en adopción' })).not.toBeInTheDocument();
  });
});

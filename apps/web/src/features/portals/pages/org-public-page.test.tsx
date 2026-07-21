import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrganizationPublic } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * Public rich portal `/o/:slug` (§M14, T-026). The page fetches the org public
 * projection with a bare `fetch` (no auth), so tests stub `fetch` per case.
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
  verificationLevel: { level: 2, criteria: ['identidad'] },
  nit: '900123456-7',
};

function stubFetch(response: { status: number; ok: boolean; body?: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: response.ok,
      status: response.status,
      json: async () => response.body ?? {},
    }),
  );
}

const PUBLIC_SESSION = { session: { initialStatus: 'unauthenticated' as const } };

beforeEach(() => {
  // Default: a valid org. Individual tests override for 404 / error cases.
  stubFetch({ status: 200, ok: true, body: ORG });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OrgPublicPage — rich public portal', () => {
  it('renders the real profile (with the reserved org-type badge) for a valid slug', async () => {
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });

    // Profile identity + badges.
    expect(await screen.findByRole('heading', { name: /Refugio Patitas/ })).toBeInTheDocument();
    // Org-type badge slot is reserved and rendered even though `org` has no type yet.
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
      // Each placeholder section shows an empty state (announced as role="status").
      expect(within(section as HTMLElement).getByRole('status')).toBeInTheDocument();
      // Its integration point is recorded for the module that will wire it.
      expect(section).toHaveAttribute('data-integration-point');
    }
  });

  it('reflects the public contract fields without a duplicated projection', async () => {
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    // Whatever public fields the contract returns are surfaced by the profile.
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
    stubFetch({ status: 200, ok: true, body: informal });

    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    expect(screen.queryByText('900123456-7')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sitio web' })).not.toBeInTheDocument();
    // Profile still renders (inherits the projection shape from the contract).
    expect(screen.getByText('hola@patitas.org')).toBeInTheDocument();
  });

  it('shows a clear public 404 for an unknown slug', async () => {
    stubFetch({ status: 404, ok: false });

    renderShell({ route: '/o/no-existe', ...PUBLIC_SESSION });

    expect(await screen.findByText('Organización no encontrada')).toBeInTheDocument();
    // No profile / sections leak through on a 404.
    expect(screen.queryByRole('heading', { name: /Refugio Patitas/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mascotas en adopción' })).not.toBeInTheDocument();
  });
});

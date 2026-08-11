import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  logoPosition?: string;
  socialNavPosition?: string;
}

function stubFetch({
  org = ORG,
  orgStatus = 200,
  orgOk = true,
  theme = {},
  logoPosition,
  socialNavPosition,
}: StubOptions = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/theme')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ tokens: theme, logoPosition, socialNavPosition }),
        });
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

  it('F2-03: the "Donar" CTA also carries city/NIT (both real, already public on this same page)', async () => {
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    const href = screen.getByTestId('portal-donate-cta').getAttribute('href') ?? '';
    expect(href).toContain(`organizationCity=${encodeURIComponent('Bogotá')}`);
    expect(href).toContain('organizationNit=900123456-7');
  });

  it('F2-03: omits city/NIT/logo from the "Donar" CTA when the org does not have them (never fabricated)', async () => {
    const { nit: _nit, location: _location, ...withoutExtras } = ORG;
    stubFetch({ org: withoutExtras });
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    const href = screen.getByTestId('portal-donate-cta').getAttribute('href') ?? '';
    expect(href).not.toContain('organizationCity');
    expect(href).not.toContain('organizationNit');
    expect(href).not.toContain('organizationLogoUrl');
  });

  it('does NOT mount the still-placeholder aggregated sections (no empty "Próximamente")', async () => {
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    // Pulido visual (T-D02): necesita hoy/transparencia have NO owning module yet
    // (status stays 'placeholder' forever until one exists) — showing an empty
    // "Próximamente" card in front of the client reads as unfinished, so these
    // sections are simply not mounted. 'pets' (T-052) and 'activeCampaign'
    // (F-CAMPANAS-PORTAL-2, S2-07) are LIVE and always show.
    for (const title of ['Necesita hoy', 'Transparencia']) {
      expect(screen.queryByRole('heading', { name: title })).not.toBeInTheDocument();
    }
    expect(screen.getByRole('heading', { name: 'Mascotas en adopción' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Campaña activa' })).toBeInTheDocument();
  });

  it('F-CAMPANAS-PORTAL-2: mounts the "Campaña activa" section wired to real data from the org-scoped feed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/theme')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ tokens: {} }) });
        }
        if (url.includes('/campaigns')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              items: [
                {
                  id: 'c1',
                  organizationId: 'org-1',
                  organizationName: 'Refugio Patitas',
                  title: 'Vacunas para el invierno',
                  category: 'medications',
                  goalAmount: 1_000_000,
                  raisedAmount: 250_000,
                  progress: 0.25,
                  deadline: '2027-01-01T00:00:00.000Z',
                  status: 'active',
                  createdAt: '2026-07-01T00:00:00.000Z',
                },
              ],
              total: 1,
              limit: 12,
              offset: 0,
            }),
          });
        }
        if (url.includes('/animals')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ items: [], total: 0, limit: 1, offset: 0 }),
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ORG });
      }),
    );
    renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
    await screen.findByRole('heading', { name: /Refugio Patitas/ });

    expect(await screen.findByText('Vacunas para el invierno')).toBeInTheDocument();
    expect(screen.getByTestId('campaign-card')).toBeInTheDocument();
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

  describe('S2-PORTAL: tabs + layout', () => {
    it('always shows the "Portafolio" tab; hides "Nosotros"/"Información" while empty', async () => {
      renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
      await screen.findByRole('heading', { name: /Refugio Patitas/ });

      expect(screen.getByRole('tab', { name: 'Portafolio' })).toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'Nosotros' })).not.toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'Información' })).not.toBeInTheDocument();
      // Contenido de siempre (catálogo + sidebar) sigue ahí, sin cambios.
      expect(screen.getByRole('heading', { name: 'Mascotas en adopción' })).toBeInTheDocument();
    });

    it('shows "Nosotros" with the real content when aboutUs is set', async () => {
      stubFetch({ org: { ...ORG, aboutUs: 'Somos un refugio con 10 años de historia.' } });
      renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
      await screen.findByRole('heading', { name: /Refugio Patitas/ });

      const tab = screen.getByRole('tab', { name: 'Nosotros' });
      await userEvent.click(tab);
      expect(
        await screen.findByText('Somos un refugio con 10 años de historia.'),
      ).toBeInTheDocument();
    });

    it('shows "Información" with hours/address/phones when extendedContact is set, and embeds an already-embeddable map URL', async () => {
      stubFetch({
        org: {
          ...ORG,
          extendedContact: {
            hours: 'Lun-Vie 9am-5pm',
            fullAddress: 'Calle 45 #12-34, Bogotá',
            mapUrl: 'https://maps.google.com/maps?q=Bogota&output=embed',
            additionalPhones: ['3001234567'],
          },
        },
      });
      renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
      await screen.findByRole('heading', { name: /Refugio Patitas/ });

      await userEvent.click(screen.getByRole('tab', { name: 'Información' }));
      expect(await screen.findByText('Lun-Vie 9am-5pm')).toBeInTheDocument();
      expect(screen.getByText('Calle 45 #12-34, Bogotá')).toBeInTheDocument();
      expect(screen.getByText('3001234567')).toBeInTheDocument();
      expect(screen.getByTitle('Ubicación en el mapa')).toHaveAttribute(
        'src',
        'https://maps.google.com/maps?q=Bogota&output=embed',
      );
    });

    it('S2-REORG: converts a Google Maps SHARE url (not already embeddable) instead of showing the "refused to connect" iframe', async () => {
      stubFetch({
        org: { ...ORG, extendedContact: { mapUrl: 'https://maps.google.com/?q=Bogota' } },
      });
      renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
      await screen.findByRole('heading', { name: /Refugio Patitas/ });

      await userEvent.click(screen.getByRole('tab', { name: 'Información' }));
      expect(await screen.findByTitle('Ubicación en el mapa')).toHaveAttribute(
        'src',
        'https://maps.google.com/maps?q=Bogota&output=embed',
      );
    });

    it('S2-REORG: falls back to a plain link for a non-Google-Maps URL (never an iframe that could be blocked)', async () => {
      stubFetch({
        org: { ...ORG, extendedContact: { mapUrl: 'https://www.openstreetmap.org/way/123' } },
      });
      renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
      await screen.findByRole('heading', { name: /Refugio Patitas/ });

      await userEvent.click(screen.getByRole('tab', { name: 'Información' }));
      const link = await screen.findByRole('link', { name: /Ver en mapa/ });
      expect(link).toHaveAttribute('href', 'https://www.openstreetmap.org/way/123');
      expect(screen.queryByTitle('Ubicación en el mapa')).not.toBeInTheDocument();
    });

    it('positions the logo per logoPosition (default "left" unchanged)', async () => {
      stubFetch({ org: { ...ORG, logoUrl: 'https://cdn.test/logo.png' }, logoPosition: 'center' });
      renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });

      const logo = await screen.findByAltText('Logo de Refugio Patitas');
      expect(logo.parentElement?.className).toContain('left-1/2');
    });

    it('moves the social sidebar to the left when socialNavPosition is "left"', async () => {
      stubFetch({ socialNavPosition: 'left' });
      renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
      await screen.findByRole('heading', { name: /Refugio Patitas/ });

      const sidebar = screen.getByRole('link', { name: 'Sitio web' }).closest('aside');
      expect(sidebar?.className).toContain('lg:order-first');
    });
  });

  describe('pulido visual: KPIs, acciones principales, franja superior y libro público', () => {
    it('shows a real KPI (animales disponibles) and never a fabricated adopciones/donaciones/calificación tile', async () => {
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
              json: async () => ({ items: [], total: 7, limit: 1, offset: 0 }),
            });
          }
          return Promise.resolve({ ok: true, status: 200, json: async () => ORG });
        }),
      );
      renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
      await screen.findByRole('heading', { name: /Refugio Patitas/ });

      const kpis = await screen.findByTestId('portal-kpis');
      expect(kpis).toHaveTextContent('Animales disponibles');
      expect(kpis).toHaveTextContent('7');
      // No fabricated metrics: those fields don't exist in the contract yet.
      expect(screen.queryByText(/Adopciones/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Calificación/)).not.toBeInTheDocument();
    });

    it('shows Donar/Adoptar/Apadrinar together at the top, and Adoptar/Apadrinar switch back to the real "Portafolio" catalog tab', async () => {
      stubFetch({ org: { ...ORG, aboutUs: 'Somos un refugio con 10 años de historia.' } });
      renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
      await screen.findByRole('heading', { name: /Refugio Patitas/ });

      const actions = screen.getByTestId('portal-header-actions');
      expect(within(actions).getByTestId('portal-donate-cta')).toBeInTheDocument();
      const adoptar = within(actions).getByRole('button', { name: 'Adoptar' });
      const apadrinar = within(actions).getByRole('button', { name: 'Apadrinar' });

      // Neither reimplements a new flow: both just land on the real catalog
      // tab ("Portafolio"), where the existing per-animal actions live.
      await userEvent.click(screen.getByRole('tab', { name: 'Nosotros' }));
      expect(screen.getByRole('tab', { name: 'Portafolio' })).toHaveAttribute(
        'data-state',
        'inactive',
      );

      await userEvent.click(adoptar);
      expect(screen.getByRole('tab', { name: 'Portafolio' })).toHaveAttribute(
        'data-state',
        'active',
      );

      await userEvent.click(screen.getByRole('tab', { name: 'Nosotros' }));
      await userEvent.click(apadrinar);
      expect(screen.getByRole('tab', { name: 'Portafolio' })).toHaveAttribute(
        'data-state',
        'active',
      );
    });

    it('2da iteración: "Campaña activa" y "Síguenos" viven juntas en UN panel lateral junto a las tabs (no sueltas arriba)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn((input: RequestInfo | URL) => {
          const url = String(input);
          if (url.endsWith('/theme')) {
            return Promise.resolve({ ok: true, status: 200, json: async () => ({ tokens: {} }) });
          }
          if (url.includes('/campaigns')) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({
                items: [
                  {
                    id: 'c1',
                    organizationId: 'org-1',
                    organizationName: 'Refugio Patitas',
                    title: 'Vacunas para el invierno',
                    category: 'medications',
                    goalAmount: 1_000_000,
                    raisedAmount: 250_000,
                    progress: 0.25,
                    deadline: '2027-01-01T00:00:00.000Z',
                    status: 'active',
                    createdAt: '2026-07-01T00:00:00.000Z',
                  },
                ],
                total: 1,
                limit: 12,
                offset: 0,
              }),
            });
          }
          if (url.includes('/animals')) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ items: [], total: 0, limit: 1, offset: 0 }),
            });
          }
          return Promise.resolve({ ok: true, status: 200, json: async () => ORG });
        }),
      );
      renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
      await screen.findByRole('heading', { name: /Refugio Patitas/ });

      const panel = screen.getByTestId('portal-side-panel');
      const campaign = await screen.findByTestId('portal-campaigns-section');
      const social = screen.getByRole('link', { name: 'Sitio web' });

      // Same lateral panel (aside), not two loose blocks in a horizontal strip.
      expect(panel).toContainElement(campaign);
      expect(panel).toContainElement(social);
      // The panel is a sibling of the tabs column, not above/before it —
      // it's a two-column layout (grid), not a stacked strip.
      const tabsList = screen.getByRole('tablist');
      expect(panel.parentElement).toBe(tabsList.closest('[class*="grid"]'));
    });

    it('shows "Transparencia — libro público" with a ComingSoon modal (no real ledger data)', async () => {
      renderShell({ route: '/o/patitas', ...PUBLIC_SESSION });
      await screen.findByRole('heading', { name: /Refugio Patitas/ });

      expect(
        screen.getByRole('heading', { name: 'Transparencia — libro público' }),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Ver libro completo →' }));
      expect(await screen.findByText('Libro público')).toBeInTheDocument();
      expect(screen.getByText('Pronto')).toBeInTheDocument();
    });
  });
});

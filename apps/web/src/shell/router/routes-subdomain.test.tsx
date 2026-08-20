import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderShell } from '../../test-utils';

/**
 * Real portal subdomains at "/" (F-1, M14). `usePortalSubdomainSlug` reads
 * `VITE_PORTAL_BASE_DOMAIN` fresh on every call (never cached at module
 * scope), so `vi.stubEnv` alone is enough here — no `vi.resetModules()`/
 * dynamic re-import needed.
 */
describe('AppRoutes — real portal subdomain resolves at "/" (F-1, M14)', () => {
  const originalLocation = window.location;

  function setHostname(hostname: string) {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, hostname },
    });
  }

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('renders Org A\'s rich portal at "/" when the host is Org A\'s real subdomain', async () => {
    vi.stubEnv('VITE_PORTAL_BASE_DOMAIN', 'adoptafacil.com');
    setHostname('patitas.adoptafacil.com');
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/by-subdomain/')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ slug: 'patitas' }),
          });
        }
        if (url.includes('/theme')) {
          return Promise.resolve({ ok: true, status: 200, json: async () => ({ tokens: {} }) });
        }
        if (url.includes('/public/organizations/patitas')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ id: 'org-1', name: 'Refugio Patitas', slug: 'patitas' }),
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ items: [] }) });
      }),
    );

    renderShell({ route: '/', session: { initialStatus: 'unauthenticated' } });

    expect(await screen.findByRole('heading', { name: 'Refugio Patitas' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Encuentra a tu próxima mascota' }),
    ).not.toBeInTheDocument();
  });

  it('falls back to the general portal when the host is not a real organization subdomain', async () => {
    vi.stubEnv('VITE_PORTAL_BASE_DOMAIN', 'adoptafacil.com');
    setHostname('localhost');

    renderShell({ route: '/', session: { initialStatus: 'unauthenticated' } });

    expect(
      await screen.findByRole('heading', { name: 'Encuentra a tu próxima mascota' }),
    ).toBeInTheDocument();
  });

  it('falls back to the general portal when VITE_PORTAL_BASE_DOMAIN is unset, even on a real-shaped host', async () => {
    vi.stubEnv('VITE_PORTAL_BASE_DOMAIN', '');
    setHostname('patitas.adoptafacil.com');

    renderShell({ route: '/', session: { initialStatus: 'unauthenticated' } });

    expect(
      await screen.findByRole('heading', { name: 'Encuentra a tu próxima mascota' }),
    ).toBeInTheDocument();
  });
});

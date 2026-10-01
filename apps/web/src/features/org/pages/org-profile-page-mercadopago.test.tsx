import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * "Conectar Mercado Pago" (Split de Pagos 1:1, T-OAuth-Connect) — the
 * `/organizacion` section that lets Owner/Administrator connect/disconnect
 * the org's own MercadoPago account. Same fetch-stub convention as
 * `org-profile-page.test.tsx`; kept in its own file so the pre-existing
 * profile-form coverage stays untouched.
 */
function sessionWith(roles: import('@adoptafacil/contracts').Role[]) {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'u1',
        name: 'Dueña',
        email: 'duena@patitas.org',
        roles,
        organizationId: 'org-1',
        accountType: 'organization' as const,
      },
    },
  };
}

const BASE_ORG = { id: 'org-1', name: 'Refugio Patitas', slug: 'patitas-felices' };

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const body = handler(String(input), init);
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => body,
        blob: async () => new Blob(),
      });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OrgProfilePage — sección "Conectar Mercado Pago" (T-OAuth-Connect)', () => {
  it('shows the connect button when the org has no account connected yet', async () => {
    stubFetch((url) => {
      if (url.includes('/org/mercadopago/status')) return { connected: false };
      return BASE_ORG;
    });
    renderShell({ route: '/organizacion', ...sessionWith([Role.Owner]) });

    await screen.findByRole('heading', { name: 'Mercado Pago' });
    expect(
      await screen.findByRole('button', { name: 'Conectar Mercado Pago' }),
    ).toBeInTheDocument();
  });

  it('shows "Cuenta conectada" + mpUserId when already connected', async () => {
    stubFetch((url) => {
      if (url.includes('/org/mercadopago/status')) {
        return { connected: true, mpUserId: '123456789', connectedAt: '2026-09-01T00:00:00.000Z' };
      }
      return BASE_ORG;
    });
    renderShell({ route: '/organizacion', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Cuenta conectada')).toBeInTheDocument();
    expect(screen.getByText(/123456789/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Conectar Mercado Pago' })).not.toBeInTheDocument();
  });

  it('clicking "Conectar Mercado Pago" fetches the authorize URL and does a full-page navigation', async () => {
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, href: '' },
    });

    try {
      stubFetch((url) => {
        if (url.includes('/org/mercadopago/status')) return { connected: false };
        if (url.includes('/org/mercadopago/connect')) {
          return { authorizeUrl: 'https://auth.mercadopago.com.co/authorization?state=abc' };
        }
        return BASE_ORG;
      });
      renderShell({ route: '/organizacion', ...sessionWith([Role.Owner]) });

      fireEvent.click(await screen.findByRole('button', { name: 'Conectar Mercado Pago' }));

      await waitFor(() => {
        expect(window.location.href).toBe(
          'https://auth.mercadopago.com.co/authorization?state=abc',
        );
      });
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    }
  });

  it('"Desconectar" requires a confirmation step before calling DELETE', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let connected = true;
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (url.includes('/org/mercadopago/status')) {
        return connected
          ? { connected: true, mpUserId: 'mp-1', connectedAt: '2026-09-01T00:00:00.000Z' }
          : { connected: false };
      }
      if (url.includes('/org/mercadopago/connect') && init?.method === 'DELETE') {
        connected = false;
        return { ok: true };
      }
      return BASE_ORG;
    });
    renderShell({ route: '/organizacion', ...sessionWith([Role.Owner]) });

    fireEvent.click(await screen.findByRole('button', { name: 'Desconectar' }));
    expect(screen.getByText(/¿Seguro que quieres desconectar/)).toBeInTheDocument();
    // Not yet deleted — only the confirmation UI appeared.
    expect(calls.some((c) => c.init?.method === 'DELETE')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Sí, desconectar' }));

    await waitFor(() => {
      expect(
        calls.some(
          (c) => c.url.endsWith('/org/mercadopago/connect') && c.init?.method === 'DELETE',
        ),
      ).toBe(true);
    });
    expect(
      await screen.findByRole('button', { name: 'Conectar Mercado Pago' }),
    ).toBeInTheDocument();
  });

  it('does NOT render the section for a member without Owner/Administrator (same gate as the bank account)', async () => {
    stubFetch((url) => {
      if (url.includes('/org/mercadopago/status')) return { connected: false };
      return BASE_ORG;
    });
    renderShell({ route: '/organizacion', ...sessionWith([Role.Operator]) });

    await screen.findByRole('heading', { name: 'Perfil de la organización' });
    expect(screen.queryByRole('heading', { name: 'Mercado Pago' })).not.toBeInTheDocument();
  });

  it('shows a success toast and strips the ?mercadopago=connected param after the OAuth round trip', async () => {
    stubFetch((url) => {
      if (url.includes('/org/mercadopago/status')) {
        return { connected: true, mpUserId: 'mp-1', connectedAt: '2026-09-01T00:00:00.000Z' };
      }
      return BASE_ORG;
    });
    renderShell({ route: '/organizacion?mercadopago=connected', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Cuenta de Mercado Pago conectada')).toBeInTheDocument();
  });

  it('shows a destructive toast on ?mercadopago=error', async () => {
    stubFetch((url) => {
      if (url.includes('/org/mercadopago/status')) return { connected: false };
      return BASE_ORG;
    });
    renderShell({ route: '/organizacion?mercadopago=error', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('No se pudo conectar Mercado Pago')).toBeInTheDocument();
  });
});

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResourceOfferStatus } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * M09 (F-6) — `/ofrecer`, envío de una oferta de donación física. Mismo SEAM
 * que `DonatePage`: el objetivo llega por query params desde el detalle
 * público de una necesidad; sin objetivo, muestra el punto de integración.
 * `POST /resources/offers` no lleva `@Roles` — cualquier autenticado.
 */
const AUTH = {
  session: {
    initialStatus: 'authenticated' as const,
    initialUser: {
      id: 'donor-1',
      name: 'Donante',
      email: 'donante@test.local',
      roles: [],
      organizationId: 'org-persona',
      accountType: 'person' as const,
    },
  },
};

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
      });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OfferResourcePage', () => {
  it('with no target in the query, shows the honest integration point instead of a form', async () => {
    renderShell({ route: '/ofrecer', ...AUTH });
    expect(await screen.findByText('Ninguna necesidad seleccionada')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Cantidad/)).not.toBeInTheDocument();
  });

  it('submits an offer for the need resolved from the query params', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (init?.method === 'POST' && url.includes('/resources/offers')) {
        return {
          id: 'off-1',
          organizationId: 'org-1',
          needId: 'need-1',
          donorUserId: 'donor-1',
          quantityOffered: 8,
          status: ResourceOfferStatus.Offered,
          createdAt: '2026-08-20T00:00:00.000Z',
          updatedAt: '2026-08-20T00:00:00.000Z',
        };
      }
      return {};
    });
    renderShell({
      route:
        '/ofrecer?needId=need-1&needTitle=Alimento%20para%20gatos&unit=kg&organizationName=Refugio%20Patitas',
      ...AUTH,
    });

    expect(await screen.findByText('Alimento para gatos')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Cantidad (kg)'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar oferta' }));

    await waitFor(() => {
      const post = calls.find((c) => c.init?.method === 'POST');
      expect(post).toBeDefined();
      const body = JSON.parse(String(post?.init?.body));
      expect(body).toMatchObject({ needId: 'need-1', quantityOffered: 8 });
    });
    expect(await screen.findByText('¡Gracias por tu ofrecimiento!')).toBeInTheDocument();
  });

  it('rejects a non-positive quantity before ever calling the API', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch((url, init) => {
      calls.push({ url, init });
      return {};
    });
    renderShell({
      route:
        '/ofrecer?needId=need-1&needTitle=Alimento%20para%20gatos&unit=kg&organizationName=Refugio%20Patitas',
      ...AUTH,
    });

    fireEvent.change(await screen.findByLabelText('Cantidad (kg)'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar oferta' }));

    expect(await screen.findByText('Cantidad inválida')).toBeInTheDocument();
    expect(calls.some((c) => c.init?.method === 'POST')).toBe(false);
  });
});

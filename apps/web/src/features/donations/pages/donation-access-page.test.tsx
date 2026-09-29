import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderShell } from '../../../test-utils';

/**
 * `/donaciones/comprobante?token=…` — comprobante de donante INVITADO vía
 * "magic link" (requisito FINAL del cliente: tampoco obligar a registrarse
 * para volver a consultar una donación). Pública (renderShell sin sesión) y
 * fuera de `<RequireAuth>` — consume `GET /public/donations/access/:token`.
 */
function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const APPROVED_DONATION = {
  donation: {
    id: 'don-1',
    organizationId: 'org-1',
    organizationName: 'Refugio Patitas',
    donorUserId: null,
    concept: { kind: 'organization', id: 'org-1' },
    commissionPayer: 'organization',
    intendedAmount: 50000,
    amountCharged: 50000,
    currency: 'COP',
    breakdown: {
      amountCharged: 50000,
      gross: 50000,
      platformFee: 2000,
      platformIva: 380,
      gatewayFee: 2025,
      gatewayIva: 385,
      net: 45210,
    },
    collectionId: 'col-1',
    status: 'approved',
    anonymous: false,
    createdAt: '2026-09-28T00:00:00.000Z',
    updatedAt: '2026-09-28T00:05:00.000Z',
  },
  receipt: {
    id: 'rec-1',
    organizationId: 'org-1',
    donationId: 'don-1',
    dedupKey: 'evt-1',
    donor: { fullName: 'Donante Invitado', email: 'guest@test.dev' },
    intendedAmount: 50000,
    breakdown: {
      amountCharged: 50000,
      gross: 50000,
      platformFee: 2000,
      platformIva: 380,
      gatewayFee: 2025,
      gatewayIva: 385,
      net: 45210,
    },
    issuedAt: '2026-09-28T00:05:00.000Z',
  },
};

afterEach(() => vi.unstubAllGlobals());

describe('DonationAccessPage (guest magic link comprobante)', () => {
  it('shows the donation status, amount and receipt for a valid token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(APPROVED_DONATION, 200))),
    );

    renderShell({ route: '/donaciones/comprobante?token=a-valid-token' });

    expect(await screen.findByText('Refugio Patitas')).toBeInTheDocument();
    expect(screen.getByText('Aprobada')).toBeInTheDocument();
    expect(screen.getByTestId('access-amount')).toHaveTextContent('50.000');
    expect(screen.getByTestId('access-receipt')).toBeInTheDocument();
    expect(screen.queryByTestId('access-view-certificate')).not.toBeInTheDocument();
  });

  it('shows a link to the public certificate verification page when a certificate exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            {
              ...APPROVED_DONATION,
              certificate: {
                id: 'cert-1',
                organizationId: 'org-1',
                donationId: 'don-1',
                code: 'ADF-CERT-2026-000123',
                organizationName: 'Refugio Patitas',
                organizationNit: '900123456-1',
                donorName: 'Donante Invitado',
                amount: 50000,
                currency: 'COP',
                issuedAt: '2026-09-28T00:05:00.000Z',
                contentHash: 'a'.repeat(64),
              },
            },
            200,
          ),
        ),
      ),
    );

    renderShell({ route: '/donaciones/comprobante?token=a-valid-token' });

    const link = await screen.findByTestId('access-view-certificate');
    expect(link).toHaveAttribute('href', '/verificar/ADF-CERT-2026-000123');
  });

  it('shows a generic "not valid or expired" message with no token in the query string', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    renderShell({ route: '/donaciones/comprobante' });

    expect(await screen.findByTestId('access-invalid')).toHaveTextContent(
      'Este enlace no es válido o expiró',
    );
    // Never even attempts the request without a token.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows the SAME generic message for an unknown/expired token (404) — never a different one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ message: 'not found' }, 404))),
    );

    renderShell({ route: '/donaciones/comprobante?token=garbage-or-expired' });

    expect(await screen.findByTestId('access-invalid')).toHaveTextContent(
      'Este enlace no es válido o expiró',
    );
  });

  it('shows a generic error state on a network/server failure (never a false "found")', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network down'))),
    );

    renderShell({ route: '/donaciones/comprobante?token=a-valid-token' });

    expect(await screen.findByTestId('access-error')).toBeInTheDocument();
  });
});

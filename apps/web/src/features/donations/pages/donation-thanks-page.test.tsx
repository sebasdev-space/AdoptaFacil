import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderShell } from '../../../test-utils';

/**
 * `/donaciones/gracias?external_reference=…` — landing REAL tras el checkout
 * de MercadoPago (bug fix: hasta ahora el link de pago se descartaba y esta
 * pantalla no existía). Pública (renderShell sin sesión) y fuera de
 * `<RequireAuth>` — consume `GET /public/donations/status/:reference`. Mismo
 * patrón de pruebas que `donation-access-page.test.tsx`.
 */
function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('DonationThanksPage (checkout redirect bug fix)', () => {
  it('shows the org name, status and amount for a known reference (pending)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            {
              status: 'pending',
              amountCharged: 50000,
              currency: 'COP',
              organizationName: 'Refugio Patitas',
            },
            200,
          ),
        ),
      ),
    );

    renderShell({ route: '/donaciones/gracias?external_reference=af-idem-1' });

    expect(await screen.findByText('Refugio Patitas')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByTestId('thanks-amount')).toHaveTextContent('50.000');
    expect(screen.getByTestId('thanks-pending-hint')).toBeInTheDocument();
  });

  it('shows the approved hint (receipt/certificate by email) when already approved', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            {
              status: 'approved',
              amountCharged: 50000,
              currency: 'COP',
              organizationName: 'Refugio Patitas',
            },
            200,
          ),
        ),
      ),
    );

    renderShell({ route: '/donaciones/gracias?external_reference=af-idem-2' });

    expect(await screen.findByTestId('thanks-approved-hint')).toBeInTheDocument();
  });

  it('shows a generic "not found" state with no external_reference in the query string', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    renderShell({ route: '/donaciones/gracias' });

    expect(await screen.findByTestId('thanks-invalid')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows the SAME generic "not found" state for an unknown reference (404)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ message: 'not found' }, 404))),
    );

    renderShell({ route: '/donaciones/gracias?external_reference=does-not-exist' });

    expect(await screen.findByTestId('thanks-invalid')).toBeInTheDocument();
  });

  it('shows a generic error state on a network/server failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network down'))),
    );

    renderShell({ route: '/donaciones/gracias?external_reference=af-idem-1' });

    expect(await screen.findByTestId('thanks-error')).toBeInTheDocument();
  });
});

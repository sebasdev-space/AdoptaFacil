import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderShell } from '../../../test-utils';

/**
 * `/apadrinar/gracias?external_reference=…` — landing REAL tras el checkout
 * de MercadoPago para un intento de cobro de apadrinamiento (bug fix: el
 * `payment_link_url` ya existía en la tabla pero nunca se escribía, y esta
 * pantalla no existía). Pública (renderShell sin sesión) — consume
 * `GET /public/sponsorships/status/:reference`. Mismo patrón de pruebas que
 * `donation-thanks-page.test.tsx`.
 */
function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('SponsorshipThanksPage (checkout redirect bug fix)', () => {
  it('shows the org name, status and amount for a known reference (pending)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            { status: 'pending', amount: 30000, organizationName: 'Refugio Patitas' },
            200,
          ),
        ),
      ),
    );

    renderShell({ route: '/apadrinar/gracias?external_reference=col-1' });

    expect(await screen.findByText('Refugio Patitas')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByTestId('sponsorship-thanks-amount')).toHaveTextContent('30.000');
    expect(screen.getByTestId('sponsorship-thanks-pending-hint')).toBeInTheDocument();
  });

  it('shows the paid hint when already confirmed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({ status: 'paid', amount: 30000, organizationName: 'Refugio Patitas' }, 200),
        ),
      ),
    );

    renderShell({ route: '/apadrinar/gracias?external_reference=col-2' });

    expect(await screen.findByTestId('sponsorship-thanks-paid-hint')).toBeInTheDocument();
  });

  it('shows a generic "not found" state with no external_reference in the query string', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    renderShell({ route: '/apadrinar/gracias' });

    expect(await screen.findByTestId('sponsorship-thanks-invalid')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows the SAME generic "not found" state for an unknown reference (404)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ message: 'not found' }, 404))),
    );

    renderShell({ route: '/apadrinar/gracias?external_reference=does-not-exist' });

    expect(await screen.findByTestId('sponsorship-thanks-invalid')).toBeInTheDocument();
  });

  it('shows a generic error state on a network/server failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network down'))),
    );

    renderShell({ route: '/apadrinar/gracias?external_reference=col-1' });

    expect(await screen.findByTestId('sponsorship-thanks-error')).toBeInTheDocument();
  });
});

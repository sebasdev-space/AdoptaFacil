import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortalReviewsSection } from './portal-reviews-section';

/**
 * S7-b (pedido del cliente): sección "Reseñas" del portal público — lista
 * las reseñas aprobadas (mismo blindaje `.items` -> [] que
 * `PortalAdoptionSection`/`PortalCampaignsSection`) y, al registrar una
 * nueva, la muestra DE INMEDIATO sin esperar un refetch.
 */
function stubFetch(sequence: Array<{ ok: boolean; body: unknown }>) {
  let call = 0;
  return vi.fn(() => {
    const response = sequence[Math.min(call, sequence.length - 1)];
    call += 1;
    return Promise.resolve({
      ok: response.ok,
      status: response.ok ? 200 : 400,
      json: async () => response.body,
    });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PortalReviewsSection', () => {
  it('renders a card per approved review read from the wrapped `.items`', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch([
        {
          ok: true,
          body: {
            items: [
              {
                id: 'rev-1',
                rating: 5,
                comment: 'Excelente',
                authorName: undefined,
                createdAt: '2026-09-29T00:00:00.000Z',
              },
            ],
            total: 1,
            limit: 30,
            offset: 0,
          },
        },
      ]),
    );

    render(<PortalReviewsSection slug="patitas" />);

    expect(await screen.findByText('Excelente')).toBeInTheDocument();
  });

  it('shows an explicit empty state for a wrapped-empty response, with the register button still present', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch([{ ok: true, body: { items: [], total: 0, limit: 30, offset: 0 } }]),
    );

    render(<PortalReviewsSection slug="patitas" />);

    expect(
      await screen.findByText(
        'Aún no hay reseñas para esta organización. ¡Sé el primero en dejar una!',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar reseña' })).toBeInTheDocument();
  });

  it('a non-array `.items` normalizes to [] — never throws (T-028c pattern)', async () => {
    vi.stubGlobal('fetch', stubFetch([{ ok: true, body: { items: null, total: 0 } }]));

    render(<PortalReviewsSection slug="patitas" />);

    expect(await screen.findByText(/Aún no hay reseñas/)).toBeInTheDocument();
  });

  it('a newly registered review appears immediately, without waiting for a refetch', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch([
        { ok: true, body: { items: [], total: 0, limit: 30, offset: 0 } },
        {
          ok: true,
          body: {
            id: 'rev-new',
            organizationId: 'org-1',
            rating: 5,
            comment: 'Recién registrada',
            isAnonymous: true,
            status: 'approved',
            createdAt: '2026-09-29T00:00:00.000Z',
          },
        },
      ]),
    );
    const user = userEvent.setup();
    render(<PortalReviewsSection slug="patitas" />);

    await screen.findByText(/Aún no hay reseñas/);
    await user.click(screen.getByRole('button', { name: 'Registrar reseña' }));
    await user.click(screen.getByRole('button', { name: 'Enviar reseña' }));

    expect(await screen.findByText('Recién registrada')).toBeInTheDocument();
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@adoptafacil/ui';
import { RegisterReviewDialog } from './register-review-dialog';

/**
 * S7-b (pedido del cliente): el botón "Registrar reseña" del portal público
 * abre un modal SIN pedir ningún dato de identidad (no hay campo de nombre,
 * correo ni contraseña) y envía a `POST /public/organizations/:slug/reviews`
 * SIN ningún header `Authorization` — "no necesita estar registrado de
 * ninguna forma".
 */
function stubFetch(response: { ok: boolean; status?: number; body: unknown }) {
  return vi.fn((_url: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve({
      ok: response.ok,
      status: response.status ?? (response.ok ? 201 : 400),
      json: async () => response.body,
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RegisterReviewDialog (S7-b — botón "Registrar reseña" del portal público)', () => {
  it('opens a modal with a 5-star picker and an optional comment — no identity field anywhere', async () => {
    const user = userEvent.setup();
    render(<RegisterReviewDialog slug="patitas" onSubmitted={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Registrar reseña' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    expect(screen.getByLabelText('Comentario (opcional)')).toBeInTheDocument();
    expect(screen.queryByLabelText(/correo|email|nombre|contraseña/i)).not.toBeInTheDocument();
  });

  it('submits WITHOUT any Authorization header and reports the created review to the caller', async () => {
    const fetchMock = stubFetch({
      ok: true,
      body: {
        id: 'rev-1',
        organizationId: 'org-1',
        rating: 4,
        comment: 'Muy buena atención',
        isAnonymous: true,
        status: 'approved',
        createdAt: '2026-09-29T00:00:00.000Z',
      },
    });
    vi.stubGlobal('fetch', fetchMock);
    const onSubmitted = vi.fn();
    const user = userEvent.setup();
    render(<RegisterReviewDialog slug="patitas" onSubmitted={onSubmitted} />);

    await user.click(screen.getByRole('button', { name: 'Registrar reseña' }));
    await user.click(screen.getByRole('radio', { name: '4 de 5 estrellas' }));
    await user.type(screen.getByLabelText('Comentario (opcional)'), 'Muy buena atención');
    await user.click(screen.getByRole('button', { name: 'Enviar reseña' }));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(onSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rev-1', rating: 4, status: 'approved' }),
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    // La base de la URL depende de VITE_API_URL del entorno; lo que importa es la ruta.
    expect(url.endsWith('/public/organizations/patitas/reviews')).toBe(true);
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(JSON.parse(init.body as string)).toEqual({ rating: 4, comment: 'Muy buena atención' });

    // The modal closes on success.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows the backend error message and keeps the modal open on failure', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch({ ok: false, body: { message: 'El rating debe estar entre 1 y 5.' } }),
    );
    const user = userEvent.setup();
    render(
      <>
        <RegisterReviewDialog slug="patitas" onSubmitted={vi.fn()} />
        <Toaster />
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Registrar reseña' }));
    await user.click(screen.getByRole('button', { name: 'Enviar reseña' }));

    expect(await screen.findByText('No se pudo enviar tu reseña')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

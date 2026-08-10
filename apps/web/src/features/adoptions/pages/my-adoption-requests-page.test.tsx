import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdoptionRequest } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * F1-01 — "Mis solicitudes" at `/mis-solicitudes`, consuming `GET /adoptions/mine`
 * (any authenticated user, no role gate — the nav entry itself is `personaOnly`,
 * covered separately in `nav-role-gating.test.tsx`). Same fetch-stub shape as
 * `adoptions-kanban-page.test.tsx`.
 */
function personaSession() {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'u1',
        name: 'Persona',
        email: 'persona@test.local',
        roles: [],
        accountType: 'person' as const,
      },
    },
  };
}

const REQUEST: AdoptionRequest = {
  id: 'req-1',
  organizationId: 'org-9',
  organizationName: 'Fundación Patitas',
  animalId: 'an-1',
  animalSnapshot: { animalId: 'an-1', name: 'Firulais', species: 'dog' },
  applicantUserId: 'u1',
  applicant: { fullName: 'Persona', email: 'persona@test.local' },
  message: 'Un mensaje suficientemente largo para la solicitud de adopción de prueba.',
  status: 'in_review',
  createdAt: '2026-08-01T15:00:00.000Z',
  updatedAt: '2026-08-01T15:00:00.000Z',
};

function stubMine(body: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/adoptions/mine')) {
        return Promise.resolve({
          ok,
          status: ok ? 200 : 500,
          headers: { get: () => null },
          json: async () => body,
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({}),
      });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('MyAdoptionRequestsPage', () => {
  it('renders each request with its animal, org name and status', async () => {
    stubMine([REQUEST]);
    renderShell({ route: '/mis-solicitudes', ...personaSession() });

    expect(await screen.findByText('Firulais')).toBeInTheDocument();
    expect(screen.getByText('Fundación Patitas')).toBeInTheDocument();
    expect(screen.getByText('En evaluación')).toBeInTheDocument();
  });

  it('shows an empty-state message when the Persona has no requests yet', async () => {
    stubMine([]);
    renderShell({ route: '/mis-solicitudes', ...personaSession() });

    expect(await screen.findByText(/Aún no has enviado ninguna solicitud/)).toBeInTheDocument();
  });

  it('shows an error message when the fetch fails, without crashing', async () => {
    stubMine(null, false);
    renderShell({ route: '/mis-solicitudes', ...personaSession() });

    expect(await screen.findByText(/No se pudieron cargar tus solicitudes/)).toBeInTheDocument();
  });

  it('never crashes on an unexpected response shape (defends like "Mis donaciones")', async () => {
    // A malformed/wrapped body (e.g. `{ items: [...] }`) must normalize to empty,
    // never throw from `.map()` on a non-array.
    stubMine({ items: [REQUEST] });
    renderShell({ route: '/mis-solicitudes', ...personaSession() });

    await waitFor(() =>
      expect(screen.getByText(/Aún no has enviado ninguna solicitud/)).toBeInTheDocument(),
    );
    expect(screen.queryByText('Firulais')).not.toBeInTheDocument();
  });

  it('REFACTOR-VISUAL Fase C2: "Ver detalle" opens a modal with the real message, read-only', async () => {
    const user = userEvent.setup();
    stubMine([REQUEST]);
    renderShell({ route: '/mis-solicitudes', ...personaSession() });

    await screen.findByText('Firulais');
    await user.click(screen.getByRole('button', { name: 'Ver detalle' }));

    const modal = await screen.findByTestId('my-request-detail-modal');
    expect(
      within(modal).getByRole('heading', { name: 'Solicitud para adoptar a Firulais' }),
    ).toBeInTheDocument();
    expect(within(modal).getByTestId('my-request-message')).toHaveTextContent(REQUEST.message);
    // Read-only: no status-advance actions like the org's ApplicantDetailModal has.
    expect(within(modal).queryByText('Aprobada')).not.toBeInTheDocument();
    expect(within(modal).queryByText('Rechazada')).not.toBeInTheDocument();
  });
});

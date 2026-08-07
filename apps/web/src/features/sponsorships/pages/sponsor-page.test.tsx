import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SponsorshipPeriodicity,
  SponsorshipStatus,
  type Sponsorship,
} from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * S2-03 — `/apadrinar`, mismo doble-propósito que `/donaciones` (T-064): SIN
 * animalId → "Mis apadrinamientos" (`GET /sponsorships/mine`); CON animalId →
 * confirmar el apadrinamiento (`GET /public/sponsorships/animals/:id` +
 * `POST /sponsorships`).
 */
function personSession() {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'padrino-1',
        name: 'Padrino Tester',
        email: 'padrino@example.test',
        roles: [],
        organizationId: 'org-padrino-1',
        accountType: 'person' as const,
      },
    },
  };
}

function sponsorship(over: Partial<Sponsorship> = {}): Sponsorship {
  return {
    id: 's-1',
    organizationId: 'org-1',
    organizationName: 'Refugio Patitas',
    planId: 'plan-1',
    planName: 'Padrinazgo mensual',
    planAmount: 30_000,
    planPeriodicity: SponsorshipPeriodicity.Monthly,
    animalId: 'animal-1',
    animalName: 'Firulais',
    sponsorUserId: 'padrino-1',
    status: SponsorshipStatus.Active,
    startedAt: '2026-07-28T21:25:22.299Z',
    createdAt: '2026-07-28T21:25:22.299Z',
    ...over,
  };
}

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

afterEach(() => vi.unstubAllGlobals());

describe('SponsorPage — sin animalId muestra "Mis apadrinamientos"', () => {
  it('lista los apadrinamientos propios con animal, org, monto y estado', async () => {
    stubFetch((url) => {
      if (url.includes('/sponsorships/mine')) return [sponsorship()];
      return [];
    });
    renderShell({ route: '/apadrinar', ...personSession() });

    expect(await screen.findByRole('heading', { name: 'Mis apadrinamientos' })).toBeInTheDocument();
    expect(await screen.findByText('Firulais')).toBeInTheDocument();
    expect(screen.getByText('Refugio Patitas')).toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
    expect(screen.getByText(/30\.000/)).toBeInTheDocument();
  });

  it('muestra un estado vacío claro (no error, no pantalla en blanco) sin apadrinamientos', async () => {
    stubFetch(() => []);
    renderShell({ route: '/apadrinar', ...personSession() });

    expect(await screen.findByRole('heading', { name: 'Mis apadrinamientos' })).toBeInTheDocument();
    expect(await screen.findByText(/Aún no apadrinas a ningún animal/)).toBeInTheDocument();
  });

  it('muestra un mensaje de error (no un crash) si la carga falla', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: () => null },
        json: async () => ({ code: 'server_error' }),
      }),
    );
    renderShell({ route: '/apadrinar', ...personSession() });

    expect(
      await screen.findByText(/No se pudieron cargar tus apadrinamientos/),
    ).toBeInTheDocument();
  });

  it('no ofrece "Ver historial" (hallazgo S2-03: el backend no expone el historial de estado al padrino)', async () => {
    stubFetch((url) => {
      if (url.includes('/sponsorships/mine')) return [sponsorship()];
      return [];
    });
    renderShell({ route: '/apadrinar', ...personSession() });

    await screen.findByText('Firulais');
    expect(screen.queryByRole('button', { name: 'Ver historial' })).not.toBeInTheDocument();
  });
});

describe('SponsorPage — con animalId confirma el apadrinamiento (plan mensual único)', () => {
  it('muestra el plan mensual y el conteo de padrinos, y apadrina al confirmar', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (url.includes('/public/sponsorships/animals/')) {
        return {
          animalId: 'animal-1',
          activePlans: [
            {
              id: 'plan-1',
              animalId: 'animal-1',
              name: 'Padrinazgo mensual',
              amount: 30_000,
              periodicity: SponsorshipPeriodicity.Monthly,
            },
          ],
          activeSponsorCount: 2,
        };
      }
      if (init?.method === 'POST' && url.endsWith('/sponsorships')) {
        // The REAL `POST /sponsorships` response never carries planAmount/planName/
        // animalName/organizationName — those are ONLY resolved by `GET
        // /sponsorships/mine` (see the contract comments). Returning the bare shape
        // here catches a regression like using `done.planAmount` (undefined → "$0").
        return sponsorship({
          organizationName: undefined,
          planName: undefined,
          planAmount: undefined,
          planPeriodicity: undefined,
          animalName: undefined,
        });
      }
      return [];
    });

    renderShell({
      route: '/apadrinar?animalId=animal-1&animalName=Firulais',
      ...personSession(),
    });

    expect(await screen.findByRole('heading', { name: 'Apadrinar' })).toBeInTheDocument();
    expect(await screen.findByText('Padrinazgo mensual')).toBeInTheDocument();
    expect(screen.getByText(/30\.000/)).toBeInTheDocument();
    expect(screen.getByText('Ya tiene 2 padrinos activos.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Apadrinar' }));

    await waitFor(() => {
      const post = calls.find((c) => c.init?.method === 'POST');
      expect(post).toBeDefined();
      expect(JSON.parse(String(post?.init?.body))).toEqual({ planId: 'plan-1' });
      // organizationId is NEVER sent by the frontend — the backend fixes it
      // from the JWT/tenant context (no-filtración, matches the backend
      // invariant already enforced server-side).
      expect(String(post?.init?.body)).not.toContain('organizationId');
    });
    expect(await screen.findByText('¡Gracias por apadrinar!')).toBeInTheDocument();
    // Regression guard: the confirmation amount must come from the plan already
    // fetched via the public summary, never from the (unenriched) POST response.
    expect(screen.getByText(/30\.000/)).toBeInTheDocument();
    expect(screen.queryByText(/\$\s*0\b/)).not.toBeInTheDocument();
  });

  it('muestra un mensaje claro cuando el animal no tiene plan activo', async () => {
    stubFetch((url) => {
      if (url.includes('/public/sponsorships/animals/')) {
        return { animalId: 'animal-1', activePlans: [], activeSponsorCount: 0 };
      }
      return [];
    });
    renderShell({ route: '/apadrinar?animalId=animal-1', ...personSession() });

    expect(
      await screen.findByText('Este animal no tiene un plan de apadrinamiento activo por ahora.'),
    ).toBeInTheDocument();
  });
});

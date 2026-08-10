import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Role,
  SponsorshipPeriodicity,
  SponsorshipStatus,
  type Sponsorship,
} from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * S2-03 — `/organizacion/apadrinamientos`, apadrinamientos RECIBIDOS por la
 * organización. `GET /sponsorships` no trae nombres (solo `mine` los trae) —
 * la página los resuelve con `GET /sponsorship-plans` + `GET /animals`, dos
 * endpoints YA existentes.
 */
function sessionWith(roles: Role[]) {
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

function sponsorship(over: Partial<Sponsorship> = {}): Sponsorship {
  return {
    id: 's-1',
    organizationId: 'org-1',
    planId: 'plan-1',
    animalId: 'animal-1',
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

function baseHandler(sponsorships: Sponsorship[]) {
  return (url: string) => {
    if (url.includes('/sponsorships?')) {
      return { items: sponsorships, total: sponsorships.length, limit: 50, offset: 0 };
    }
    if (url.includes('/sponsorship-plans')) {
      return {
        items: [
          {
            id: 'plan-1',
            organizationId: 'org-1',
            animalId: 'animal-1',
            name: 'Padrinazgo mensual',
            amount: 30_000,
            periodicity: SponsorshipPeriodicity.Monthly,
            isActive: true,
            createdAt: '2026-07-01T00:00:00.000Z',
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
      };
    }
    if (url.includes('/animals?')) {
      return [{ id: 'animal-1', organizationId: 'org-1', name: 'Firulais' }];
    }
    return [];
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('SponsorshipsPage — apadrinamientos recibidos por la organización (S2-03)', () => {
  it('lista con animal/plan resueltos, monto y estado, para Owner (gestiona)', async () => {
    stubFetch(baseHandler([sponsorship()]));
    renderShell({ route: '/organizacion/apadrinamientos', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Firulais')).toBeInTheDocument();
    expect(screen.getByText(/Padrinazgo mensual/)).toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
    expect(screen.getByText(/30\.000\/mes/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suspender' })).toBeInTheDocument();
  });

  it('muestra un estado vacío claro sin apadrinamientos', async () => {
    stubFetch(baseHandler([]));
    renderShell({ route: '/organizacion/apadrinamientos', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Aún no hay apadrinamientos')).toBeInTheDocument();
  });

  it('oculta las acciones de suspender/reactivar para ReadOnlyAuditor (solo ve)', async () => {
    stubFetch(baseHandler([sponsorship()]));
    renderShell({
      route: '/organizacion/apadrinamientos',
      ...sessionWith([Role.ReadOnlyAuditor]),
    });

    expect(await screen.findByText('Firulais')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspender' })).not.toBeInTheDocument();
  });

  it('nunca ofrece acciones sobre un apadrinamiento CANCELADO (terminal)', async () => {
    stubFetch(baseHandler([sponsorship({ status: SponsorshipStatus.Cancelled })]));
    renderShell({ route: '/organizacion/apadrinamientos', ...sessionWith([Role.Owner]) });

    expect(await screen.findByText('Cancelado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspender' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reactivar' })).not.toBeInTheDocument();
  });

  it('ofrece "Cancelar" junto a Suspender para un apadrinamiento activo', async () => {
    stubFetch(baseHandler([sponsorship()]));
    renderShell({ route: '/organizacion/apadrinamientos', ...sessionWith([Role.Owner]) });

    expect(await screen.findByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('nunca ofrece "Cancelar" sobre un apadrinamiento ya cancelado (terminal)', async () => {
    stubFetch(baseHandler([sponsorship({ status: SponsorshipStatus.Cancelled })]));
    renderShell({ route: '/organizacion/apadrinamientos', ...sessionWith([Role.Owner]) });

    await screen.findByText('Cancelado');
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  });

  it('cancelar pide confirmación (acción terminal) antes de llamar al endpoint', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (init?.method === 'POST' && url.includes('/cancel')) {
        return sponsorship({ status: SponsorshipStatus.Cancelled });
      }
      return baseHandler([sponsorship()])(url);
    });
    renderShell({ route: '/organizacion/apadrinamientos', ...sessionWith([Role.Owner]) });

    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText(/no puede reactivarse/)).toBeInTheDocument();
    expect(calls.some((c) => c.init?.method === 'POST')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Sí, cancelar' }));

    await waitFor(() => {
      const post = calls.find((c) => c.init?.method === 'POST');
      expect(post).toBeDefined();
      expect(post?.url).toContain('/sponsorships/s-1/cancel');
    });
    expect(await screen.findByText('Apadrinamiento cancelado')).toBeInTheDocument();
  });

  it('oculta "Cancelar" para ReadOnlyAuditor igual que suspender/reactivar', async () => {
    stubFetch(baseHandler([sponsorship()]));
    renderShell({
      route: '/organizacion/apadrinamientos',
      ...sessionWith([Role.ReadOnlyAuditor]),
    });

    expect(await screen.findByText('Firulais')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  });

  it('Owner suspende un apadrinamiento activo y ve el toast de confirmación', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let suspended = false;
    stubFetch((url, init) => {
      calls.push({ url, init });
      if (init?.method === 'POST' && url.includes('/suspend')) {
        suspended = true;
        return sponsorship({ status: SponsorshipStatus.Suspended });
      }
      return baseHandler([
        sponsorship({ status: suspended ? SponsorshipStatus.Suspended : SponsorshipStatus.Active }),
      ])(url);
    });
    renderShell({ route: '/organizacion/apadrinamientos', ...sessionWith([Role.Owner]) });

    fireEvent.click(await screen.findByRole('button', { name: 'Suspender' }));

    await waitFor(() => {
      const post = calls.find((c) => c.init?.method === 'POST');
      expect(post).toBeDefined();
      expect(post?.url).toContain('/sponsorships/s-1/suspend');
    });
    expect(await screen.findByText('Apadrinamiento suspendido')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Reactivar' })).toBeInTheDocument();
  });

  describe('Fase 9 — "Registrar fallecimiento" (vista próximamente, sin backend real)', () => {
    it('ofrece la acción solo sobre un apadrinamiento ACTIVO, y abre el modal con datos reales', async () => {
      stubFetch(baseHandler([sponsorship()]));
      renderShell({ route: '/organizacion/apadrinamientos', ...sessionWith([Role.Owner]) });

      const trigger = await screen.findByRole('button', { name: 'Registrar fallecimiento' });
      fireEvent.click(trigger);

      expect(
        await screen.findByRole('heading', { name: 'Registrar fallecimiento de Firulais' }),
      ).toBeInTheDocument();
      expect(screen.getByText('Firulais tiene 1 padrino activo.')).toBeInTheDocument();
      expect(screen.getByText('Disponible próximamente')).toBeInTheDocument();

      const modal = screen.getByTestId('animal-deceased-modal');
      fireEvent.click(within(modal).getAllByRole('button', { name: 'Cerrar' })[0]);
      await waitFor(() =>
        expect(
          screen.queryByRole('heading', { name: 'Registrar fallecimiento de Firulais' }),
        ).not.toBeInTheDocument(),
      );
    });

    it('no la ofrece sobre un apadrinamiento ya cancelado (terminal)', async () => {
      stubFetch(baseHandler([sponsorship({ status: SponsorshipStatus.Cancelled })]));
      renderShell({ route: '/organizacion/apadrinamientos', ...sessionWith([Role.Owner]) });

      await screen.findByText('Cancelado');
      expect(
        screen.queryByRole('button', { name: 'Registrar fallecimiento' }),
      ).not.toBeInTheDocument();
    });

    it('la oculta para ReadOnlyAuditor, igual que el resto de acciones de gestión', async () => {
      stubFetch(baseHandler([sponsorship()]));
      renderShell({
        route: '/organizacion/apadrinamientos',
        ...sessionWith([Role.ReadOnlyAuditor]),
      });

      expect(await screen.findByText('Firulais')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Registrar fallecimiento' }),
      ).not.toBeInTheDocument();
    });
  });
});

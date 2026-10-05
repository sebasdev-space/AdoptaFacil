import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampaignStatus, Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * M13 (S-14) — el dashboard de donaciones/campañas ahora vive DENTRO de "Inicio"
 * (antes pantalla propia, casi duplicada). Misma lógica de roles/datos de siempre.
 */
function sessionWith(roles: Role[]) {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'user-1',
        name: 'Usuario',
        email: 'usuario@refugio.test',
        roles,
        organizationId: 'org-self',
        accountType: 'organization' as const,
      },
    },
  };
}

const SUMMARY = {
  animalsActive: 1,
  adoptionRequestsPending: 0,
  sponsorshipsActive: 0,
  donationsReceivedTotal: 10000,
  documentsExpiringSoon: 0,
  documentsRejected: 0,
  formalizationLevel: 0,
  formalizationPercent: 100,
};

/** Responde por URL: el resumen de Inicio y el dashboard de donaciones son llamadas distintas. */
function stubFetch(dashboard: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('/org/dashboard/donations')
        ? dashboard
        : url.includes('/org/summary')
          ? SUMMARY
          : {};
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

describe('OrgDonationsDashboardSection dentro de "Inicio" (M13, S-14)', () => {
  it('Owner ve las tres secciones en Inicio, con el aviso de "contrato no existe" en Donaciones', async () => {
    stubFetch({
      donations: { pending: 2, approved: 5, declined: 1, netReceivedTotal: 150000 },
      campaigns: [
        {
          id: 'camp-1',
          title: 'Cirugías de emergencia',
          status: CampaignStatus.Active,
          goalAmount: 1000000,
          raisedAmount: 250000,
          progress: 0.25,
          deadline: '2026-12-31T00:00:00.000Z',
          endingSoon: false,
        },
      ],
      sponsorships: { active: 4, suspended: 1, cancelled: 0, atPaymentRisk: 1 },
    });
    renderShell({ route: '/inicio', ...sessionWith([Role.Owner]) });

    const main = within(await screen.findByRole('main'));
    expect(
      await main.findByRole('heading', { name: 'Donaciones, campañas y apadrinamientos' }),
    ).toBeInTheDocument();
    expect(
      await main.findByText(/el contrato de donación todavía no existe en el sistema/i),
    ).toBeInTheDocument();
    expect(main.getByText('Cirugías de emergencia')).toBeInTheDocument();
    expect(main.getByText('Apadrinamientos — salud de facturación')).toBeInTheDocument();
    expect(main.getByText('Revisar')).toBeInTheDocument(); // atPaymentRisk > 0
  });

  it('un rol al que el backend le niega apadrinamientos (Operator) no ve esa sección', async () => {
    stubFetch({
      donations: { pending: 0, approved: 0, declined: 0, netReceivedTotal: 0 },
      campaigns: [],
    });
    renderShell({ route: '/inicio', ...sessionWith([Role.Operator]) });

    const main = within(await screen.findByRole('main'));
    expect(
      await main.findByText('Esta organización no tiene campañas registradas.'),
    ).toBeInTheDocument();
    expect(main.queryByText('Apadrinamientos — salud de facturación')).not.toBeInTheDocument();
  });

  it('un rol fuera del dashboard (Volunteer) no ve la sección ni dispara la consulta', async () => {
    stubFetch({});
    renderShell({ route: '/inicio', ...sessionWith([Role.Volunteer]) });

    await screen.findByRole('heading', { name: 'Inicio' });
    expect(
      screen.queryByRole('heading', { name: 'Donaciones, campañas y apadrinamientos' }),
    ).not.toBeInTheDocument();
    const urls = vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('/org/dashboard/donations'))).toBe(false);
  });

  it('la ruta vieja /organizacion/dashboard-donaciones redirige a Inicio', async () => {
    stubFetch({
      donations: { pending: 0, approved: 0, declined: 0, netReceivedTotal: 0 },
      campaigns: [],
      sponsorships: { active: 0, suspended: 0, cancelled: 0, atPaymentRisk: 0 },
    });
    renderShell({ route: '/organizacion/dashboard-donaciones', ...sessionWith([Role.Owner]) });

    expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
  });
});

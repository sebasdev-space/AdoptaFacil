import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampaignStatus, Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

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

function stubFetch(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => body,
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('OrgDonationsDashboardPage (M13, S-14)', () => {
  it('Owner sees the three sections, including the "contrato no existe" disclaimer on Donaciones', async () => {
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
    renderShell({ route: '/organizacion/dashboard-donaciones', ...sessionWith([Role.Owner]) });

    const main = within(await screen.findByRole('main'));
    expect(main.getByText('Donaciones')).toBeInTheDocument();
    expect(
      main.getByText(/el contrato de donación todavía no existe en el sistema/i),
    ).toBeInTheDocument();
    expect(main.getByText('Cirugías de emergencia')).toBeInTheDocument();
    expect(main.getByText('Apadrinamientos — salud de facturación')).toBeInTheDocument();
    expect(main.getByText('Revisar')).toBeInTheDocument(); // atPaymentRisk > 0 badge
  });

  it('a role denied by the backend (e.g. Operator) never sees the Apadrinamientos section', async () => {
    stubFetch({
      donations: { pending: 0, approved: 0, declined: 0, netReceivedTotal: 0 },
      campaigns: [],
      // sponsorships undefined — Operator doesn't have access per the backend
    });
    renderShell({ route: '/organizacion/dashboard-donaciones', ...sessionWith([Role.Operator]) });

    const main = within(await screen.findByRole('main'));
    expect(await main.findByText('Donaciones')).toBeInTheDocument();
    expect(main.getByText('Campañas')).toBeInTheDocument();
    expect(main.queryByText('Apadrinamientos — salud de facturación')).not.toBeInTheDocument();
  });

  it('a role outside the dashboard entirely (Volunteer) is denied', async () => {
    stubFetch({});
    renderShell({ route: '/organizacion/dashboard-donaciones', ...sessionWith([Role.Volunteer]) });
    expect(await screen.findByText('Sin acceso')).toBeInTheDocument();
  });

  it('shows an explicit empty state when the org has no campaigns yet', async () => {
    stubFetch({
      donations: { pending: 0, approved: 0, declined: 0, netReceivedTotal: 0 },
      campaigns: [],
      sponsorships: { active: 0, suspended: 0, cancelled: 0, atPaymentRisk: 0 },
    });
    renderShell({ route: '/organizacion/dashboard-donaciones', ...sessionWith([Role.Owner]) });

    expect(
      await screen.findByText('Esta organización no tiene campañas registradas.'),
    ).toBeInTheDocument();
  });
});

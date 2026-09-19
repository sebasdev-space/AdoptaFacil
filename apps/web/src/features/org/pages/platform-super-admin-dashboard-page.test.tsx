import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

function sessionWith(roles: Role[]) {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'super-1',
        name: 'SuperAdmin',
        email: 'super@plataforma.test',
        roles,
        organizationId: 'org-self',
        accountType: 'organization' as const,
      },
    },
  };
}

const SUMMARY = {
  grossTotal: 1_000_000,
  platformFeeTotal: 47_600,
  gatewayFeeTotal: 29_988,
  netTotal: 922_412,
  organizationsByVerificationLevel: [
    { level: 0, count: 3 },
    { level: 2, count: 5 },
  ],
  activeAnimals: 12,
  totalAdoptions: 4,
  activeCampaigns: 2,
  activeSponsorships: 6,
  organizationsByDepartment: [
    { department: 'Antioquia', count: 4 },
    { department: 'Bogotá, D.C.', count: 2 },
  ],
  organizationsGrowth: { currentPeriodCount: 9, previousPeriodCount: 6, growthRatePct: 50 },
};

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

describe('PlatformSuperAdminDashboardPage (RF24)', () => {
  it('shows financial totals, business counts, verification levels and the Colombia choropleth', async () => {
    stubFetch(SUMMARY);
    renderShell({
      route: '/plataforma/dashboard/financiero',
      ...sessionWith([Role.PlatformSuperAdmin]),
    });

    expect(await screen.findByText(/\$\s?1\.000\.000/)).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /Mapa de Colombia con organizaciones registradas/ }),
    ).toBeInTheDocument();
    // `<title>` lives inside each <path> (per-shape tooltip/accessible name),
    // not `svg > title`, so `getByText` (not `getByTitle`, which only looks
    // at `svg > title`) is how RTL reaches it.
    expect(screen.getByText('Antioquia: 4 organizaciones')).toBeInTheDocument();
    expect(screen.getByText('Bogotá, D.C.: 2 organizaciones')).toBeInTheDocument();
    // Every other department renders too (count 0), just with the muted fill.
    expect(screen.getByText('Vichada: 0 organizaciones')).toBeInTheDocument();
    expect(screen.getByText('Sin verificar')).toBeInTheDocument();
    expect(screen.getByText('Verificado')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument(); // activeAnimals
    expect(screen.getByText('9')).toBeInTheDocument(); // organizationsGrowth.currentPeriodCount
    expect(screen.getByText(/▲ \+50% vs\. mes anterior/)).toBeInTheDocument();
  });

  it('lists a department that does not match any known map shape separately, instead of dropping it', async () => {
    stubFetch({
      ...SUMMARY,
      organizationsByDepartment: [
        ...SUMMARY.organizationsByDepartment,
        { department: 'Sin especificar', count: 3 },
      ],
    });
    renderShell({
      route: '/plataforma/dashboard/financiero',
      ...sessionWith([Role.PlatformSuperAdmin]),
    });

    expect(await screen.findByText('Sin especificar: 3')).toBeInTheDocument();
  });

  it('shows a negative growth rate with a down arrow when organizations registered fewer than the previous period', async () => {
    stubFetch({
      ...SUMMARY,
      organizationsGrowth: { currentPeriodCount: 3, previousPeriodCount: 6, growthRatePct: -50 },
    });
    renderShell({
      route: '/plataforma/dashboard/financiero',
      ...sessionWith([Role.PlatformSuperAdmin]),
    });

    expect(await screen.findByText(/▼ -50% vs\. mes anterior/)).toBeInTheDocument();
  });

  it('denies a normal PlatformAdmin (financial data is SuperAdmin-only)', async () => {
    stubFetch(SUMMARY);
    renderShell({
      route: '/plataforma/dashboard/financiero',
      ...sessionWith([Role.PlatformAdmin]),
    });
    expect(await screen.findByText('Sin acceso')).toBeInTheDocument();
  });
});

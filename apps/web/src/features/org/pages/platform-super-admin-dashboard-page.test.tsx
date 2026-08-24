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
    { department: 'Bogotá D.C.', count: 2 },
  ],
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
  it('shows financial totals, business counts, verification levels and department bars', async () => {
    stubFetch(SUMMARY);
    renderShell({
      route: '/plataforma/dashboard/financiero',
      ...sessionWith([Role.PlatformSuperAdmin]),
    });

    expect(await screen.findByText(/\$\s?1\.000\.000/)).toBeInTheDocument();
    expect(screen.getByText('Antioquia')).toBeInTheDocument();
    expect(screen.getByText('Bogotá D.C.')).toBeInTheDocument();
    expect(screen.getByText('Sin verificar')).toBeInTheDocument();
    expect(screen.getByText('Verificado')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument(); // activeAnimals
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

import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

function sessionWith(roles: Role[]) {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'admin-1',
        name: 'Admin',
        email: 'admin@plataforma.test',
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

describe('PlatformAdminDashboardPage (RF24)', () => {
  it('shows the three consolidated queue counts', async () => {
    stubFetch({ pendingDocuments: 3, pendingDuplicateFlags: 1, pendingReviews: 5 });
    renderShell({ route: '/plataforma/dashboard', ...sessionWith([Role.PlatformAdmin]) });

    const main = within(await screen.findByRole('main'));
    expect(main.getByText('3')).toBeInTheDocument();
    expect(main.getByText('1')).toBeInTheDocument();
    expect(main.getByText('5')).toBeInTheDocument();
    expect(main.getByText('Documentos pendientes')).toBeInTheDocument();
    expect(main.getByText('Organizaciones duplicadas')).toBeInTheDocument();
    expect(main.getByText('Reseñas por moderar')).toBeInTheDocument();
  });

  it('denies a role outside PLATFORM_ADMIN_DASHBOARD_ROLES', async () => {
    stubFetch({ pendingDocuments: 0, pendingDuplicateFlags: 0, pendingReviews: 0 });
    renderShell({ route: '/plataforma/dashboard', ...sessionWith([Role.Owner]) });
    expect(await screen.findByText('Sin acceso')).toBeInTheDocument();
  });
});

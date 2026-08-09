import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@adoptafacil/contracts';
import { renderShell } from '../../../test-utils';

/**
 * F-DONACIONES-RECIBIDAS — la contraparte de gestión de org de "Mis donaciones"
 * (donante), contra `GET /donations/received` (ya existente en el backend,
 * MANAGE_ROLES). El gating de ruta/nav se cubre en shell/router/nav-role-gating
 * .test.tsx; este archivo cubre los DATOS que renderiza la vista.
 */
function orgSession() {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'owner-1',
        name: 'Owner Tester',
        email: 'owner@refugio.test',
        roles: [Role.Owner],
        organizationId: 'org-1',
        accountType: 'organization' as const,
      },
    },
  };
}

function stubFetch(handler: (url: string) => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const body = handler(String(input));
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

describe('ReceivedDonationsPage', () => {
  it('shows the REAL donor, amount and status for an approved donation (data the contract already exposes)', async () => {
    stubFetch((url) => {
      if (url.includes('/donations/received')) {
        return [
          {
            id: 'd-1',
            organizationId: 'org-1',
            donorUserId: 'donor-1',
            concept: { kind: 'organization', id: 'org-1' },
            commissionPayer: 'organization',
            intendedAmount: 50000,
            amountCharged: 50000,
            currency: 'COP',
            breakdown: {
              amountCharged: 50000,
              gross: 50000,
              platformFee: 2000,
              platformIva: 380,
              gatewayFee: 2025,
              gatewayIva: 385,
              net: 45210,
            },
            collectionId: 'test_abc123',
            status: 'approved',
            createdAt: '2026-07-28T21:25:22.299Z',
            updatedAt: '2026-07-28T21:25:22.299Z',
            receipt: {
              id: 'r-1',
              organizationId: 'org-1',
              donationId: 'd-1',
              dedupKey: 'evt-1',
              donor: { fullName: 'Camilo Torres', email: 'camilo@test.local' },
              intendedAmount: 50000,
              breakdown: {
                amountCharged: 50000,
                gross: 50000,
                platformFee: 2000,
                platformIva: 380,
                gatewayFee: 2025,
                gatewayIva: 385,
                net: 45210,
              },
              issuedAt: '2026-07-28T22:00:00.000Z',
            },
          },
        ];
      }
      return [];
    });

    renderShell({ route: '/donaciones-recibidas', ...orgSession() });

    expect(
      await screen.findByRole('heading', { name: 'Donaciones recibidas' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Camilo Torres')).toBeInTheDocument();
    expect(screen.getByText('Aprobada')).toBeInTheDocument();
    expect(screen.getByText('Donación general')).toBeInTheDocument();
    expect(screen.getByText(/45\.210/)).toBeInTheDocument();
  });

  it('never fabricates a donor name for a pending donation (no receipt yet)', async () => {
    stubFetch((url) => {
      if (url.includes('/donations/received')) {
        return [
          {
            id: 'd-2',
            organizationId: 'org-1',
            donorUserId: 'donor-2',
            concept: { kind: 'animal', id: '08d734c6-1900-4bf4-b3e5-d6468479cf8b' },
            commissionPayer: 'donor',
            intendedAmount: 30000,
            amountCharged: 32000,
            currency: 'COP',
            breakdown: {
              amountCharged: 32000,
              gross: 30000,
              platformFee: 1200,
              platformIva: 228,
              gatewayFee: 795,
              gatewayIva: 151,
              net: 29999,
            },
            collectionId: 'test_pending',
            status: 'pending',
            createdAt: '2026-07-28T21:25:22.299Z',
            updatedAt: '2026-07-28T21:25:22.299Z',
          },
        ];
      }
      return [];
    });

    renderShell({ route: '/donaciones-recibidas', ...orgSession() });

    expect(await screen.findByText('Recibo pendiente')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    // The raw donorUserId (an opaque id) is never shown as if it were a name.
    expect(screen.queryByText('donor-2')).not.toBeInTheDocument();
    // Concept id shown short, never fabricating an animal name.
    expect(screen.getByText('Animal #08d734c6')).toBeInTheDocument();
  });

  it('shows a friendly empty state when the org has received no donations yet', async () => {
    stubFetch(() => []);
    renderShell({ route: '/donaciones-recibidas', ...orgSession() });

    expect(
      await screen.findByRole('heading', { name: 'Donaciones recibidas' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Tu organización aún no ha recibido ninguna donación.'),
    ).toBeInTheDocument();
  });

  it('shows an error message (not a crash) when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: () => null },
        json: async () => ({ code: 'server_error', message: 'boom' }),
      }),
    );
    renderShell({ route: '/donaciones-recibidas', ...orgSession() });

    expect(
      await screen.findByText(/No se pudieron cargar las donaciones recibidas/),
    ).toBeInTheDocument();
  });
});

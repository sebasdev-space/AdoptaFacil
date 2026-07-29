import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderShell } from '../../../test-utils';

/**
 * T-064 — completes the "no target" branch of `/donaciones` (reached from the
 * sidebar menu, WITHOUT an org query param) into a real "Mis donaciones" list
 * fed by `GET /donations/mine`, replacing the previous static empty-state.
 * The "WITH target" branch (donate form, reached from an org's public portal)
 * is asserted unchanged — non-regression for T-050/T-051.
 */
function personSession() {
  return {
    session: {
      initialStatus: 'authenticated' as const,
      initialUser: {
        id: 'donor-1',
        name: 'Donante Tester',
        email: 'donante@example.test',
        roles: [],
        organizationId: 'org-donor-1',
        accountType: 'person' as const,
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

describe('DonatePage — "no target" now shows "Mis donaciones" (T-064)', () => {
  it('lists the donor’s own donations with org label, status badge and amount', async () => {
    stubFetch((url) => {
      if (url.includes('/donations/mine')) {
        return [
          {
            id: 'd-1',
            organizationId: '08d734c6-1900-4bf4-b3e5-d6468479cf8b',
            donorUserId: 'donor-1',
            concept: { kind: 'organization', id: '08d734c6-1900-4bf4-b3e5-d6468479cf8b' },
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
          },
        ];
      }
      return [];
    });

    renderShell({ route: '/donaciones', ...personSession() });

    expect(await screen.findByRole('heading', { name: 'Mis donaciones' })).toBeInTheDocument();
    expect(await screen.findByText('Organización #08d734c6')).toBeInTheDocument();
    // Same async-loaded render as the heading/org label above — findBy, not
    // getBy, so a slower CI runner can't race ahead of the fetched list.
    expect(await screen.findByText('Aprobada')).toBeInTheDocument();
    expect(await screen.findByText(/50\.000/)).toBeInTheDocument();
  });

  it('shows an empty-state (not a crash) when the donor has no donations yet', async () => {
    stubFetch(() => []);
    renderShell({ route: '/donaciones', ...personSession() });

    expect(await screen.findByRole('heading', { name: 'Mis donaciones' })).toBeInTheDocument();
    expect(await screen.findByText(/Aún no has hecho ninguna donación/)).toBeInTheDocument();
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
    renderShell({ route: '/donaciones', ...personSession() });

    expect(await screen.findByText(/No se pudieron cargar tus donaciones/)).toBeInTheDocument();
  });

  it('fetches and shows the receipt on demand for an APPROVED donation', async () => {
    stubFetch((url) => {
      if (url.includes('/donations/mine')) {
        return [
          {
            id: 'd-1',
            organizationId: '08d734c6-1900-4bf4-b3e5-d6468479cf8b',
            donorUserId: 'donor-1',
            concept: { kind: 'organization', id: '08d734c6-1900-4bf4-b3e5-d6468479cf8b' },
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
          },
        ];
      }
      if (url.includes('/receipt')) {
        return {
          id: 'r-1',
          organizationId: '08d734c6-1900-4bf4-b3e5-d6468479cf8b',
          donationId: 'd-1',
          dedupKey: 'evt-1',
          donor: { fullName: 'Donante Tester', email: 'donante@example.test' },
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
        };
      }
      return [];
    });

    renderShell({ route: '/donaciones', ...personSession() });
    await screen.findByRole('heading', { name: 'Mis donaciones' });

    // The button only exists once the fetched (approved) donation has rendered
    // — findBy (not getBy) so CI's slower scheduling can't race ahead of it.
    fireEvent.click(await screen.findByRole('button', { name: 'Ver recibo' }));
    await waitFor(() => {
      // { selector: 'dd' } scopes to the receipt's donor field specifically —
      // the session user's own name ALSO renders in the shell header (same
      // literal text here, coincidentally), so an unscoped match is ambiguous.
      expect(screen.getByText('Donante Tester', { selector: 'dd' })).toBeInTheDocument();
      expect(screen.getByText(/45\.210/)).toBeInTheDocument();
    });
  });

  it('does NOT offer "Ver recibo" for a PENDING donation', async () => {
    stubFetch((url) => {
      if (url.includes('/donations/mine')) {
        return [
          {
            id: 'd-2',
            organizationId: '08d734c6-1900-4bf4-b3e5-d6468479cf8b',
            donorUserId: 'donor-1',
            concept: { kind: 'organization', id: '08d734c6-1900-4bf4-b3e5-d6468479cf8b' },
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
            collectionId: 'test_xyz',
            status: 'pending',
            createdAt: '2026-07-28T21:25:22.299Z',
            updatedAt: '2026-07-28T21:25:22.299Z',
          },
        ];
      }
      return [];
    });

    renderShell({ route: '/donaciones', ...personSession() });
    await screen.findByRole('heading', { name: 'Mis donaciones' });
    // Same async-loaded render as the heading above — findBy, not getBy.
    expect(await screen.findByText('Pendiente')).toBeInTheDocument();
    // Absence check: safe as queryBy once the render above is confirmed settled.
    expect(screen.queryByRole('button', { name: 'Ver recibo' })).not.toBeInTheDocument();
  });
});

describe('DonatePage — "with target" is unchanged (non-regression, T-050/T-051)', () => {
  it('still shows the donate form when an org target is present in the query', async () => {
    stubFetch(() => []);
    renderShell({
      route: '/donaciones?organizationId=org-1&organizationName=Refugio%20Patitas',
      ...personSession(),
    });

    expect(await screen.findByRole('heading', { name: 'Donar' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Refugio Patitas' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mis donaciones' })).not.toBeInTheDocument();
  });
});

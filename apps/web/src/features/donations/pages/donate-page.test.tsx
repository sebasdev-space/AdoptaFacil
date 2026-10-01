import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CardPaymentBrickProps } from '../../payments';
import { renderShell } from '../../../test-utils';

/**
 * T-OrdersAPI: the real `CardPaymentBrick` loads MercadoPago's external SDK
 * script (jsdom can't execute it) — mocked here with a fake "submit" button
 * that calls `onResult` with fixed, deterministic card data, same technique
 * as `donate-form.test.tsx`.
 */
vi.mock('../../payments', () => ({
  CardPaymentBrick: ({ onResult }: CardPaymentBrickProps) => (
    <button
      type="button"
      data-testid="fake-card-brick-submit"
      onClick={() =>
        void onResult({ cardToken: 'tok-test-123', paymentMethodId: 'visa', installments: 1 })
      }
    >
      Simular pago con tarjeta
    </button>
  ),
}));

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

  it('F2-03: shows the REAL organization name when the backend resolves it, not the id placeholder', async () => {
    stubFetch((url) => {
      if (url.includes('/donations/mine')) {
        return [
          {
            id: 'd-3',
            organizationId: '08d734c6-1900-4bf4-b3e5-d6468479cf8b',
            organizationName: 'Refugio Patitas',
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
            collectionId: 'test_real_name',
            status: 'approved',
            createdAt: '2026-07-28T21:25:22.299Z',
            updatedAt: '2026-07-28T21:25:22.299Z',
          },
        ];
      }
      return [];
    });

    renderShell({ route: '/donaciones', ...personSession() });

    expect(await screen.findByText('Refugio Patitas')).toBeInTheDocument();
    expect(screen.queryByText('Organización #08d734c6')).not.toBeInTheDocument();
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

describe('F-MIS-DONACIONES-PLUS: detalle + acceso al certificado desde "Mis donaciones"', () => {
  function approvedDonationFixture() {
    return {
      id: 'd-approved-1',
      organizationId: '08d734c6-1900-4bf4-b3e5-d6468479cf8b',
      organizationName: 'Refugio Patitas',
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
      collectionId: 'test_approved',
      status: 'approved',
      payer: { fullName: 'Donante Tester', email: 'donante@example.test' },
      createdAt: '2026-07-28T21:25:22.299Z',
      updatedAt: '2026-07-28T21:25:22.299Z',
    };
  }

  it('opens a detail modal with the REAL persisted breakdown (never recomputed) when "Ver detalle" is clicked', async () => {
    stubFetch((url) => (url.includes('/donations/mine') ? [approvedDonationFixture()] : []));

    renderShell({ route: '/donaciones', ...personSession() });
    await screen.findByRole('heading', { name: 'Mis donaciones' });

    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle' }));

    const modal = await screen.findByTestId('donation-detail-modal');
    expect(within(modal).getByText('Refugio Patitas')).toBeInTheDocument();
    expect(within(modal).getByText(/Donación general/)).toBeInTheDocument();
    expect(within(modal).getByText('Aprobada')).toBeInTheDocument();
    // The stored breakdown, with the same F-NOMENCLATURA labels as the checkout —
    // NOT recomputed via computeBreakdown from intendedAmount.
    expect(within(modal).getByTestId('donation-detail-platformFee')).toHaveTextContent('2.000');
    expect(within(modal).getByTestId('donation-detail-net')).toHaveTextContent('45.210');
  });

  it('an APPROVED donation offers "Ver / descargar certificado", landing on the REAL certificate (RF14, F-3)', async () => {
    stubFetch((url) => {
      if (url.includes('/donations/mine')) return [approvedDonationFixture()];
      if (url.includes('/certificate')) {
        return {
          id: 'cert-1',
          organizationId: '08d734c6-1900-4bf4-b3e5-d6468479cf8b',
          donationId: 'd-approved-1',
          code: 'ADF-CERT-2026-000456',
          organizationName: 'Refugio Patitas',
          organizationNit: '900123456-1',
          donorName: 'Donante Tester',
          amount: 50000,
          currency: 'COP',
          issuedAt: '2026-07-28T22:00:00.000Z',
          contentHash: 'b'.repeat(64),
        };
      }
      return [];
    });

    renderShell({ route: '/donaciones', ...personSession() });
    await screen.findByRole('heading', { name: 'Mis donaciones' });

    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle' }));
    const modal = await screen.findByTestId('donation-detail-modal');
    fireEvent.click(within(modal).getByTestId('view-certificate-from-detail'));

    // Scoped to the document itself: the session user's own name also renders in
    // the shell header, so an unscoped match on "Donante Tester" is ambiguous.
    const document = within(await screen.findByTestId('certificate-document'));
    expect(document.getByText('Refugio Patitas', { exact: false })).toBeInTheDocument();
    expect(document.getByText('Donante Tester')).toBeInTheDocument();
    expect(document.getByText(/50\.000/)).toBeInTheDocument();
    expect(document.getByText('ADF-CERT-2026-000456')).toBeInTheDocument();
  });

  it('a PENDING donation (no receipt yet) has NO active certificate link — disabled with the reason', async () => {
    stubFetch((url) => {
      if (url.includes('/donations/mine')) {
        return [
          { ...approvedDonationFixture(), id: 'd-pending-1', status: 'pending', payer: undefined },
        ];
      }
      return [];
    });

    renderShell({ route: '/donaciones', ...personSession() });
    await screen.findByRole('heading', { name: 'Mis donaciones' });

    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle' }));
    const modal = await screen.findByTestId('donation-detail-modal');

    expect(within(modal).queryByTestId('view-certificate-from-detail')).not.toBeInTheDocument();
    const disabledButton = within(modal).getByTestId('certificate-unavailable');
    expect(disabledButton).toBeDisabled();
    expect(disabledButton).toHaveAttribute('title', expect.stringMatching(/recibo/i));
  });
});

/**
 * Checkout de invitado (requisito FINAL del cliente): donar nunca exige cuenta
 * ni login. Sin `session` explícita, `renderShell` arranca en
 * `status: 'unauthenticated'` (ver test-utils.tsx / session-context.tsx) — el
 * mismo estado de un visitante real que nunca inició sesión.
 */
describe('DonatePage — checkout de invitado (sin sesión, requisito final del cliente)', () => {
  it('shows the donate form with guest name/email fields, no donor-identity block', async () => {
    stubFetch(() => []);
    renderShell({
      route: '/donaciones?organizationId=org-1&organizationName=Refugio%20Patitas',
    });

    await screen.findByRole('heading', { name: 'Donar' });
    expect(screen.queryByTestId('donor-identity')).not.toBeInTheDocument();
    expect(screen.getByTestId('donation-guest-name')).toBeInTheDocument();
    expect(screen.getByTestId('donation-guest-email')).toBeInTheDocument();
  });

  it('creates the donation with the guest payer and offers creating a free account afterwards', async () => {
    stubFetch((url) => {
      if (url.includes('/donations')) {
        return {
          id: 'don-guest-1',
          organizationId: 'org-1',
          donorUserId: null,
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
          collectionId: 'test_guest',
          status: 'pending',
          anonymous: false,
          createdAt: '2026-09-28T00:00:00.000Z',
          updatedAt: '2026-09-28T00:00:00.000Z',
        };
      }
      return [];
    });

    renderShell({
      route: '/donaciones?organizationId=org-1&organizationName=Refugio%20Patitas',
    });

    await screen.findByRole('heading', { name: 'Donar' });
    fireEvent.change(screen.getByPlaceholderText('50000'), { target: { value: '50000' } });
    fireEvent.change(screen.getByTestId('donation-guest-name'), {
      target: { value: 'Invitado Test' },
    });
    fireEvent.change(screen.getByTestId('donation-guest-email'), {
      target: { value: 'invitado@test.dev' },
    });
    // Step 1 → step 2 (Card Payment Brick, mocked above) → the Brick's own
    // submit is what actually triggers the charge (T-OrdersAPI).
    fireEvent.click(screen.getByRole('button', { name: /Donar a Refugio Patitas/ }));
    fireEvent.click(await screen.findByTestId('fake-card-brick-submit'));

    expect(await screen.findByText(/¡Gracias por tu donación!/)).toBeInTheDocument();
    const cta = screen.getByTestId('create-account-cta');
    expect(cta).toHaveAttribute('href', '/register');
  });

  it('T-OrdersAPI: shows an honest "pago rechazado" state (declined), with a retry that reopens the form', async () => {
    stubFetch((url) => {
      if (url.includes('/donations')) {
        return {
          id: 'don-declined-1',
          organizationId: 'org-1',
          donorUserId: null,
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
          collectionId: 'test_declined',
          status: 'declined',
          anonymous: false,
          createdAt: '2026-09-28T00:00:00.000Z',
          updatedAt: '2026-09-28T00:00:00.000Z',
        };
      }
      return [];
    });

    renderShell({
      route: '/donaciones?organizationId=org-1&organizationName=Refugio%20Patitas',
    });

    await screen.findByRole('heading', { name: 'Donar' });
    fireEvent.change(screen.getByPlaceholderText('50000'), { target: { value: '50000' } });
    fireEvent.change(screen.getByTestId('donation-guest-name'), {
      target: { value: 'Invitado Test' },
    });
    fireEvent.change(screen.getByTestId('donation-guest-email'), {
      target: { value: 'invitado@test.dev' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Donar a Refugio Patitas/ }));
    fireEvent.click(await screen.findByTestId('fake-card-brick-submit'));

    expect(await screen.findByTestId('donation-declined')).toBeInTheDocument();
    expect(screen.queryByText(/¡Gracias por tu donación!/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('donation-retry-card'));
    expect(await screen.findByTestId('donation-guest-name')).toBeInTheDocument();
  });

  it('does NOT offer the account-creation CTA to an already-authenticated donor', async () => {
    stubFetch((url) => {
      if (url.includes('/donations')) {
        return {
          id: 'don-auth-1',
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
          collectionId: 'test_auth',
          status: 'pending',
          anonymous: false,
          createdAt: '2026-09-28T00:00:00.000Z',
          updatedAt: '2026-09-28T00:00:00.000Z',
        };
      }
      return [];
    });

    renderShell({
      route: '/donaciones?organizationId=org-1&organizationName=Refugio%20Patitas',
      ...personSession(),
    });

    await screen.findByRole('heading', { name: 'Donar' });
    fireEvent.change(screen.getByPlaceholderText('50000'), { target: { value: '50000' } });
    fireEvent.click(screen.getByRole('button', { name: /Donar a Refugio Patitas/ }));
    fireEvent.click(await screen.findByTestId('fake-card-brick-submit'));

    expect(await screen.findByText(/¡Gracias por tu donación!/)).toBeInTheDocument();
    expect(screen.queryByTestId('create-account-cta')).not.toBeInTheDocument();
  });

  it('shows a public, non-crashing empty-state (not "Mis donaciones") when there is no target and no session', async () => {
    stubFetch(() => []);
    renderShell({ route: '/donaciones' });

    expect(await screen.findByText(/Aún no elegiste a quién donar/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mis donaciones' })).not.toBeInTheDocument();
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

  it("F2-03: shows the donor's own identity (session user), not a placeholder", async () => {
    stubFetch(() => []);
    renderShell({
      route: '/donaciones?organizationId=org-1&organizationName=Refugio%20Patitas',
      ...personSession(),
    });

    await screen.findByRole('heading', { name: 'Donar' });
    const identity = screen.getByTestId('donor-identity');
    expect(identity).toHaveTextContent('Donante Tester');
    expect(identity).toHaveTextContent('donante@example.test');
  });

  it('F2-03: shows org logo/city/NIT when the portal CTA passed them (all real, all optional)', async () => {
    stubFetch(() => []);
    renderShell({
      route:
        '/donaciones?organizationId=org-1&organizationName=Refugio%20Patitas' +
        '&organizationLogoUrl=https%3A%2F%2Fcdn.test%2Flogo.png' +
        '&organizationCity=Bogot%C3%A1&organizationNit=901.456.789-0',
      ...personSession(),
    });

    await screen.findByRole('heading', { name: 'Refugio Patitas' });
    expect(screen.getByTestId('donation-org-logo')).toHaveAttribute(
      'src',
      'https://cdn.test/logo.png',
    );
    const meta = screen.getByTestId('donation-org-meta');
    expect(meta).toHaveTextContent('Bogotá');
    expect(meta).toHaveTextContent('NIT 901.456.789-0');
  });

  it('F2-03: shows no logo/city/NIT block when the portal CTA did not pass them (never fabricated)', async () => {
    stubFetch(() => []);
    renderShell({
      route: '/donaciones?organizationId=org-1&organizationName=Refugio%20Patitas',
      ...personSession(),
    });

    await screen.findByRole('heading', { name: 'Refugio Patitas' });
    expect(screen.queryByTestId('donation-org-logo')).not.toBeInTheDocument();
    expect(screen.queryByTestId('donation-org-meta')).not.toBeInTheDocument();
  });
});

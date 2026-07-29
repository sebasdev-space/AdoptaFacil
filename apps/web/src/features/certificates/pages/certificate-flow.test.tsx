import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderShell } from '../../../test-utils';
import { CERTIFICATE_NEUTRAL_FALLBACK, MOCK_CERTIFICATE } from '../model/mock-certificate';

/**
 * §M05/RF14 (maqueta T-053) — the trust-flow chain wired into the shell:
 *   donación REAL (recibo) → emisión (mock) → verificación pública (mock) → evidencia.
 * Every mocked screen (steps 2-5) carries the "vista de diseño" label.
 */
const AUTH = { session: { initialStatus: 'authenticated' as const } };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('certificate trust-flow (mockup)', () => {
  it('emission screen: "vista de diseño" label, sample certificate + verify CTA', async () => {
    renderShell({ route: '/certificado', ...AUTH });

    expect(await screen.findByTestId('design-preview')).toBeInTheDocument();
    expect(screen.getByTestId('certificate-document')).toBeInTheDocument();
    expect(screen.getByTestId('certificate-code')).toHaveTextContent(MOCK_CERTIFICATE.code);
    expect(screen.getByTestId('sample-qr')).toBeInTheDocument();
    // Gating conceptual RF14: emisor ESAL con RTE.
    expect(screen.getAllByText(/ESAL/).length).toBeGreaterThan(0);
    expect(screen.getByTestId('verify-certificate-cta')).toHaveAttribute(
      'href',
      `/verificar/${encodeURIComponent(MOCK_CERTIFICATE.code)}`,
    );
  });

  it('with NO real donation in nav-state, uses a NEUTRAL fallback — never the fictitious sample entity (T-066)', async () => {
    renderShell({ route: '/certificado', ...AUTH });

    const doc = await screen.findByTestId('certificate-document');
    expect(doc).toHaveTextContent(CERTIFICATE_NEUTRAL_FALLBACK.organizationName);
    expect(doc).toHaveTextContent(CERTIFICATE_NEUTRAL_FALLBACK.donorName);
    expect(doc).not.toHaveTextContent(MOCK_CERTIFICATE.organizationName);
    expect(doc).not.toHaveTextContent(MOCK_CERTIFICATE.donorName);
    // Code/hash/QR stay sample regardless.
    expect(screen.getByTestId('certificate-code')).toHaveTextContent(MOCK_CERTIFICATE.code);
  });

  it('chains emission → public verification → authenticity evidence', async () => {
    renderShell({ route: '/certificado', ...AUTH });
    fireEvent.click(await screen.findByTestId('verify-certificate-cta'));

    // Landed on the public verification screen, auto-verified by the code in the URL.
    expect(await screen.findByText('Certificado válido')).toBeInTheDocument();
    expect(screen.getByTestId('authenticity-evidence')).toHaveTextContent(
      MOCK_CERTIFICATE.organizationName,
    );
    // Still a mock screen → keeps the label.
    expect(screen.getByTestId('design-preview')).toBeInTheDocument();
  });

  it('splices from the REAL donation receipt into the certificate flow (T-050 intact)', async () => {
    // Stub the donation POST so the real flow reaches its success/receipt state.
    const jsonResponse = (body: unknown, status: number) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/donations')) {
          return Promise.resolve(
            jsonResponse(
              {
                id: 'don-1',
                organizationId: 'org-1',
                amountCharged: 50000,
                intendedAmount: 50000,
                status: 'pending',
                payer: { fullName: 'María Restrepo' },
              },
              201,
            ),
          );
        }
        return Promise.resolve(jsonResponse({ status: 'ok', db: 'up', redis: 'up' }, 200));
      }),
    );

    renderShell({
      route: '/donaciones?organizationId=org-1&organizationName=Refugio%20Patitas',
      ...AUTH,
    });

    // Real donation flow (T-050) still works end to end.
    fireEvent.change(await screen.findByPlaceholderText('50000'), { target: { value: '50000' } });
    fireEvent.click(screen.getByRole('button', { name: /Donar a Refugio Patitas/ }));

    // Receipt → the splice CTA into the certificate mockup appears.
    const cta = await screen.findByTestId('view-certificate-cta');
    expect(cta).toHaveAttribute('href', '/certificado');

    // Following it lands on the emission "vista de diseño".
    fireEvent.click(cta);
    await waitFor(() => expect(screen.getByTestId('design-preview')).toBeInTheDocument());
    expect(screen.getByTestId('certificate-document')).toBeInTheDocument();
  });

  it('shows the REAL organization, amount and donor from the donation flow — not the fictitious sample (T-066)', async () => {
    const jsonResponse = (body: unknown, status: number) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/donations')) {
          return Promise.resolve(
            jsonResponse(
              {
                id: 'don-2',
                organizationId: 'org-catcompany',
                amountCharged: 75000,
                intendedAmount: 75000,
                status: 'pending',
                payer: { fullName: 'Juan Pérez' },
              },
              201,
            ),
          );
        }
        return Promise.resolve(jsonResponse({ status: 'ok', db: 'up', redis: 'up' }, 200));
      }),
    );

    renderShell({
      route: '/donaciones?organizationId=org-catcompany&organizationName=CatCompany',
      ...AUTH,
    });

    fireEvent.change(await screen.findByPlaceholderText('50000'), { target: { value: '75000' } });
    fireEvent.click(screen.getByRole('button', { name: /Donar a CatCompany/ }));

    fireEvent.click(await screen.findByTestId('view-certificate-cta'));

    const doc = await screen.findByTestId('certificate-document');
    expect(doc).toHaveTextContent('CatCompany');
    expect(doc).toHaveTextContent('Juan Pérez');
    expect(doc).toHaveTextContent('75.000');
    // The fictitious sample entity never appears once real data is available.
    expect(doc).not.toHaveTextContent(MOCK_CERTIFICATE.organizationName);
    expect(doc).not.toHaveTextContent(MOCK_CERTIFICATE.donorName);
    // Still a mockup: code stays sample and the "vista de diseño" label persists.
    expect(screen.getByTestId('certificate-code')).toHaveTextContent(MOCK_CERTIFICATE.code);
    expect(screen.getByTestId('design-preview')).toBeInTheDocument();
  });
});

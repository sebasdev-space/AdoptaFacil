import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderShell } from '../../../test-utils';

/**
 * §M05/RF14 (F-3) — CertificateEmissionPage against the REAL backend
 * (replaces the T-053 mockup suite). No more sample code/hash/QR, no
 * same-session nav-state consistency hack: the certificate is fetched by
 * `donationId` from `GET /donations/:id/certificate`.
 */
const AUTH = { session: { initialStatus: 'authenticated' as const } };

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CertificateEmissionPage (RF14, F-3 — real backend)', () => {
  it('cold visit (no donation in nav-state) shows the honest "not available" state', async () => {
    renderShell({ route: '/certificado', ...AUTH });
    expect(await screen.findByText('Certificado no disponible aún')).toBeInTheDocument();
  });

  it('splices from the real donation receipt, renders the REAL certificate, and links to real public verification', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (method === 'POST' && url.includes('/donations') && !url.includes('/webhook')) {
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
        if (url.includes('/donations/don-1/certificate')) {
          return Promise.resolve(
            jsonResponse(
              {
                id: 'cert-1',
                organizationId: 'org-1',
                donationId: 'don-1',
                code: 'ADF-CERT-2026-000123',
                organizationName: 'Refugio Patitas',
                organizationNit: '900123456-1',
                donorName: 'María Restrepo',
                amount: 50000,
                currency: 'COP',
                issuedAt: '2026-08-20T15:30:00.000Z',
                contentHash: 'a'.repeat(64),
              },
              200,
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

    fireEvent.change(await screen.findByPlaceholderText('50000'), { target: { value: '50000' } });
    fireEvent.click(screen.getByRole('button', { name: /Donar a Refugio Patitas/ }));
    fireEvent.click(await screen.findByTestId('view-certificate-cta'));

    const doc = await screen.findByTestId('certificate-document');
    expect(doc).toHaveTextContent('Refugio Patitas');
    expect(doc).toHaveTextContent('900123456-1');
    expect(doc).toHaveTextContent('María Restrepo');
    expect(screen.getByTestId('certificate-code')).toHaveTextContent('ADF-CERT-2026-000123');
    expect(screen.getByTestId('verify-certificate-cta')).toHaveAttribute(
      'href',
      '/verificar/ADF-CERT-2026-000123',
    );
    // El QR real (dinámico, generado en el navegador) — ya no la imagen de muestra fija.
    expect(await screen.findByTestId('certificate-qr')).toBeInTheDocument();
  });

  it('when the certificate is not yet issued (404 — pending or not ESAL-RTE), shows the honest "not available" state, never a fabricated one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (method === 'POST' && url.includes('/donations') && !url.includes('/webhook')) {
          return Promise.resolve(
            jsonResponse(
              {
                id: 'don-2',
                organizationId: 'org-2',
                amountCharged: 20000,
                intendedAmount: 20000,
                status: 'pending',
              },
              201,
            ),
          );
        }
        if (url.includes('/donations/don-2/certificate')) {
          return Promise.resolve(jsonResponse({ message: 'not found' }, 404));
        }
        return Promise.resolve(jsonResponse({ status: 'ok', db: 'up', redis: 'up' }, 200));
      }),
    );

    renderShell({
      route: '/donaciones?organizationId=org-2&organizationName=Otro%20Refugio',
      ...AUTH,
    });
    fireEvent.change(await screen.findByPlaceholderText('50000'), { target: { value: '20000' } });
    fireEvent.click(screen.getByRole('button', { name: /Donar a Otro Refugio/ }));
    fireEvent.click(await screen.findByTestId('view-certificate-cta'));

    expect(await screen.findByText('Certificado no disponible aún')).toBeInTheDocument();
    expect(screen.queryByTestId('certificate-document')).not.toBeInTheDocument();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CertificateVerificationPage } from './certificate-verification-page';

/**
 * §M05/RF14 (F-3) — public certificate verification against the REAL backend
 * (replaces the T-053 mockup suite): queries
 * `GET /public/donations/certificates/:code`, no session, no local sample
 * comparison.
 */
function renderVerify(initialPath: string) {
  return render(
    <MemoryRouter
      initialEntries={[initialPath]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/verificar" element={<CertificateVerificationPage />} />
        <Route path="/verificar/:code" element={<CertificateVerificationPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const VALID_CERTIFICATE = {
  code: 'ADF-CERT-2026-000123',
  organizationName: 'Refugio Patitas',
  organizationNit: '900123456-1',
  donorName: 'María Restrepo',
  amount: 150000,
  currency: 'COP',
  issuedAt: '2026-08-20T15:30:00.000Z',
  contentHash: 'a'.repeat(64),
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CertificateVerificationPage (RF14, F-3 — real backend)', () => {
  it('shows only the search form when no code is given', () => {
    renderVerify('/verificar');
    expect(screen.getByLabelText('Código del certificado')).toBeInTheDocument();
    expect(screen.queryByTestId('verification-result')).not.toBeInTheDocument();
  });

  it('deep-link with :code auto-verifies against the real endpoint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(VALID_CERTIFICATE, 200))),
    );

    renderVerify(`/verificar/${VALID_CERTIFICATE.code}`);

    const evidence = await screen.findByTestId('authenticity-evidence');
    expect(evidence).toHaveTextContent('Refugio Patitas');
    expect(evidence).toHaveTextContent('900123456-1');
    expect(evidence).toHaveTextContent('María Restrepo');
    expect(evidence).toHaveTextContent('150.000');
  });

  it('verifies a code entered manually', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(VALID_CERTIFICATE, 200))),
    );
    renderVerify('/verificar');

    fireEvent.change(screen.getByLabelText('Código del certificado'), {
      target: { value: VALID_CERTIFICATE.code },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));

    expect(await screen.findByText('Certificado válido')).toBeInTheDocument();
  });

  it('shows a not-found state for an unknown code (no false positives, never fabricated)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ message: 'not found' }, 404))),
    );
    renderVerify('/verificar');

    fireEvent.change(screen.getByLabelText('Código del certificado'), {
      target: { value: 'ADF-CERT-0000-000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));

    expect(await screen.findByText('Código no encontrado')).toBeInTheDocument();
    expect(screen.queryByTestId('verification-result')).not.toBeInTheDocument();
  });

  it('shows a generic error state on a network/server failure (never a false "valid")', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network down'))),
    );
    renderVerify('/verificar');

    fireEvent.change(screen.getByLabelText('Código del certificado'), {
      target: { value: VALID_CERTIFICATE.code },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));

    expect(await screen.findByText('No se pudo verificar')).toBeInTheDocument();
  });
});

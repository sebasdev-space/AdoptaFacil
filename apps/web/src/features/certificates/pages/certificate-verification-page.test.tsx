import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CertificateVerificationPage } from './certificate-verification-page';
import { MOCK_CERTIFICATE } from '../model/mock-certificate';

/**
 * §M05/RF14 (maqueta T-053) — public certificate verification. No backend: verifies
 * the sample code deterministically and shows the authenticity evidence. Every mock
 * screen carries the "vista de diseño" label.
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

describe('CertificateVerificationPage', () => {
  it('always shows the "vista de diseño" label (mock screen)', () => {
    renderVerify('/verificar');
    expect(screen.getByTestId('design-preview')).toBeInTheDocument();
  });

  it('auto-verifies a deep link with the sample code → válido + authenticity evidence', () => {
    renderVerify(`/verificar/${MOCK_CERTIFICATE.code}`);

    expect(screen.getByTestId('verification-result')).toBeInTheDocument();
    expect(screen.getByText('Certificado válido')).toBeInTheDocument();
    // Evidence of authenticity: ESAL-RTE issuer + the sample hash.
    const evidence = screen.getByTestId('authenticity-evidence');
    expect(evidence).toHaveTextContent(MOCK_CERTIFICATE.organizationName);
    expect(evidence).toHaveTextContent(MOCK_CERTIFICATE.contentHash);
  });

  it('verifies the sample code entered manually', () => {
    renderVerify('/verificar');
    fireEvent.change(screen.getByLabelText('Código del certificado'), {
      target: { value: MOCK_CERTIFICATE.code },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(screen.getByText('Certificado válido')).toBeInTheDocument();
  });

  it('shows a not-found state for an unknown code (no false positives)', () => {
    renderVerify('/verificar');
    fireEvent.change(screen.getByLabelText('Código del certificado'), {
      target: { value: 'ADF-CERT-0000-000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(screen.getByText('Código no encontrado')).toBeInTheDocument();
    expect(screen.queryByTestId('verification-result')).not.toBeInTheDocument();
  });
});

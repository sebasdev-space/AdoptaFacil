import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CertificateVerificationPage } from './certificate-verification-page';
import { CERTIFICATE_NEUTRAL_FALLBACK, MOCK_CERTIFICATE } from '../model/mock-certificate';

/**
 * §M05/RF14 (maqueta T-053 → F-CERT-REAL) — public certificate verification. No
 * backend: verifies the sample code deterministically. Without nav-state (deep
 * link / manual entry, i.e. a "cold" visit with no real donation behind it) it
 * shows the NEUTRAL fallback — never the old fictitious sample entity, since that
 * was exactly the inconsistency F-CERT-REAL removes. With nav-state (same-session
 * hand-off from `CertificateEmissionPage`) it shows the REAL donation data. Every
 * mock screen carries the "vista de diseño" label.
 */
function renderVerify(initialPath: string, state?: unknown) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: initialPath, state }]}
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

  it('F-CERT-REAL: a "cold" deep link (no nav-state) shows the NEUTRAL fallback, never the fictitious sample entity', () => {
    renderVerify(`/verificar/${MOCK_CERTIFICATE.code}`);

    expect(screen.getByTestId('verification-result')).toBeInTheDocument();
    expect(screen.getByText('Certificado válido')).toBeInTheDocument();
    const evidence = screen.getByTestId('authenticity-evidence');
    expect(evidence).toHaveTextContent(CERTIFICATE_NEUTRAL_FALLBACK.organizationName);
    expect(evidence).toHaveTextContent(CERTIFICATE_NEUTRAL_FALLBACK.donorName);
    expect(evidence).not.toHaveTextContent(MOCK_CERTIFICATE.organizationName);
    expect(evidence).not.toHaveTextContent(MOCK_CERTIFICATE.donorName);
    // The sample hash/code stay — RF14 real generation is post-pitch either way.
    expect(evidence).toHaveTextContent(MOCK_CERTIFICATE.contentHash);
  });

  it('F-CERT-REAL: with the real certificate via nav-state (same-session hand-off from emission), shows those exact real data — consistent with the certificate', () => {
    renderVerify(`/verificar/${MOCK_CERTIFICATE.code}`, {
      certificate: {
        ...MOCK_CERTIFICATE,
        organizationName: 'CatCompany',
        organizationNit: '900.111.222-3',
        donorName: 'Juan Pérez',
        amount: 75000,
      },
    });

    const evidence = screen.getByTestId('authenticity-evidence');
    expect(evidence).toHaveTextContent('CatCompany');
    expect(evidence).toHaveTextContent('NIT 900.111.222-3');
    expect(evidence).toHaveTextContent('Juan Pérez');
    expect(evidence).toHaveTextContent('75.000');
    // The fictitious sample entity and the neutral fallback never appear once
    // the real certificate is available — this is THE consistency fix.
    expect(evidence).not.toHaveTextContent(MOCK_CERTIFICATE.organizationName);
    expect(evidence).not.toHaveTextContent(CERTIFICATE_NEUTRAL_FALLBACK.organizationName);
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

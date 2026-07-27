import { Link, useLocation } from 'react-router-dom';
import { buttonVariants, cn } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { DesignPreviewBanner } from '../components/design-preview-banner';
import { CertificateDocument } from '../components/certificate-document';
import { MOCK_CERTIFICATE, mockVerifyPath, type MockCertificate } from '../model/mock-certificate';

/** Datos reales que la donación (T-050) puede aportar al empalme, si llegan por
 *  nav-state. Todo lo demás del certificado es de muestra. */
interface EmissionNavState {
  donation?: {
    intendedAmount?: number;
    payer?: { fullName?: string };
  };
}

/**
 * Paso 2-3 del flujo de confianza (§M05/RF14, maqueta T-053): EMISIÓN del certificado.
 * Es una "vista de diseño" que se muestra tras el recibo REAL de la donación
 * (T-050/T-051) — el empalme. Exhibe la plantilla del certificado (org ESAL-RTE de
 * ejemplo), el código único y el QR de muestra, y enlaza a la verificación pública.
 * CERO backend: si la donación real llega por nav-state, solo se refleja el donante y
 * el monto sobre la plantilla de ejemplo; el resto (código, hash, QR) es de muestra.
 */
export function CertificateEmissionPage() {
  const location = useLocation();
  const donation = (location.state as EmissionNavState | null)?.donation;

  const certificate: MockCertificate = {
    ...MOCK_CERTIFICATE,
    donorName: donation?.payer?.fullName?.trim() || MOCK_CERTIFICATE.donorName,
    amount:
      typeof donation?.intendedAmount === 'number'
        ? donation.intendedAmount
        : MOCK_CERTIFICATE.amount,
  };

  return (
    <PageContainer>
      <PageHeader
        title="Tu certificado de donación"
        description="Tras confirmarse tu donación, la organización emite un certificado verificable."
      />
      <div className="space-y-6">
        <DesignPreviewBanner detail="Así se verá el certificado que emitiremos:" />
        <CertificateDocument certificate={certificate} />
        <div className="flex flex-col items-start gap-1">
          <Link
            to={mockVerifyPath(certificate.code)}
            className={cn(buttonVariants())}
            data-testid="verify-certificate-cta"
          >
            Verificar este certificado
          </Link>
          <p className="text-xs text-muted-foreground">
            Cualquiera puede comprobar su autenticidad con el código, sin iniciar sesión.
          </p>
        </div>
      </div>
    </PageContainer>
  );
}

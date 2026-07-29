import { Link, useLocation } from 'react-router-dom';
import { buttonVariants, cn } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { DesignPreviewBanner } from '../components/design-preview-banner';
import { CertificateDocument } from '../components/certificate-document';
import {
  CERTIFICATE_NEUTRAL_FALLBACK,
  MOCK_CERTIFICATE,
  mockVerifyPath,
  type MockCertificate,
} from '../model/mock-certificate';

/**
 * Datos REALES que la donación (T-050/T-051) aporta al empalme, si llegan por
 * nav-state (T-066): el nombre de la org (ya en scope en `DonatePage` al
 * momento del link) y el propio recibo de la donación (monto + donante, fijado
 * desde la sesión al crear la donación). Código único, NIT, hash y QR SIGUEN
 * siendo de muestra (RF14 real es post-demo) — nunca se recalculan aquí.
 */
interface EmissionNavState {
  organizationName?: string;
  donation?: {
    intendedAmount?: number;
    payer?: { fullName?: string };
  };
}

/**
 * Paso 2-3 del flujo de confianza (§M05/RF14, maqueta T-053): EMISIÓN del certificado.
 * Es una "vista de diseño" que se muestra tras el recibo REAL de la donación
 * (T-050/T-051) — el empalme. Exhibe la plantilla del certificado, el código único
 * y el QR de muestra, y enlaza a la verificación pública.
 *
 * T-066: cuando la donación real llega por nav-state, la plantilla refleja el
 * nombre REAL de la organización, el monto REAL y el donante REAL — código, NIT,
 * hash y QR permanecen de muestra (CERO backend, RF14 real es post-demo). Sin
 * nav-state (p. ej. entrada directa a la ruta), se usa un fallback NEUTRO — nunca
 * se reintroduce una entidad ficticia con nombre propio.
 */
export function CertificateEmissionPage() {
  const location = useLocation();
  const state = location.state as EmissionNavState | null;
  const donation = state?.donation;

  const certificate: MockCertificate = {
    ...MOCK_CERTIFICATE,
    organizationName:
      state?.organizationName?.trim() || CERTIFICATE_NEUTRAL_FALLBACK.organizationName,
    donorName: donation?.payer?.fullName?.trim() || CERTIFICATE_NEUTRAL_FALLBACK.donorName,
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

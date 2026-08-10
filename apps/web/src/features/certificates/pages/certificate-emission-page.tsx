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
import styles from './certificate-emission-page.module.scss';

/**
 * Datos REALES que la donación (T-050/T-051/F2-03) aporta al empalme, si llegan
 * por nav-state (T-066): el nombre de la org y su NIT real (F2-03, solo si es
 * pública/formalizada — ya en scope en `DonatePage` al momento del link) y el
 * propio recibo de la donación (monto + donante, fijado desde la sesión al
 * crear la donación). Código único y hash SIGUEN siendo de muestra (RF14 real
 * es post-demo) — nunca se recalculan aquí.
 */
interface EmissionNavState {
  organizationName?: string;
  organizationNit?: string;
  donation?: {
    intendedAmount?: number;
    payer?: { fullName?: string };
  };
}

/**
 * Paso 2-3 del flujo de confianza (§M05/RF14, maqueta T-053 → F-CERT-REAL): EMISIÓN
 * del certificado. Es una "vista de diseño" que se muestra tras el recibo REAL de la
 * donación (T-050/T-051) — el empalme. Exhibe la plantilla del certificado, el
 * código único y un QR REAL (escanea a adoptafacil.org, no al código del
 * certificado), y enlaza a la verificación pública.
 *
 * T-066/F2-03: cuando la donación real llega por nav-state, la plantilla refleja el
 * nombre REAL de la organización, su NIT REAL (si es formalizada), el monto REAL y
 * el donante REAL — código y hash permanecen de muestra (CERO backend, RF14 real es
 * post-demo). Sin nav-state (p. ej. entrada directa a la ruta), se usa un fallback
 * NEUTRO — nunca se reintroduce una entidad ficticia con nombre propio.
 *
 * F-CERT-REAL: el mismo `certificate` (con los datos reales ya resueltos) viaja por
 * nav-state al seguir "Verificar este certificado", para que esa pantalla muestre
 * EXACTAMENTE lo mismo — sin esto, sin backend, la verificación no tenía forma de
 * saber qué donación se está viendo y mostraba un segundo set de muestra
 * incoherente. Un código pegado a mano o un deep-link SIN ese estado (p. ej. abrir
 * la URL de verificación directamente en otra pestaña) no puede reconstruir la
 * donación real sin backend (RF14) — cae al mismo fallback NEUTRO, nunca a datos
 * inventados.
 */
export function CertificateEmissionPage() {
  const location = useLocation();
  const state = location.state as EmissionNavState | null;
  const donation = state?.donation;

  const certificate: MockCertificate = {
    ...MOCK_CERTIFICATE,
    organizationName:
      state?.organizationName?.trim() || CERTIFICATE_NEUTRAL_FALLBACK.organizationName,
    // Nunca de muestra: dato legal sensible, solo se muestra si es real (F-CERT-REAL).
    organizationNit: state?.organizationNit?.trim() || undefined,
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
        <div className={styles['cert-cta']}>
          <Link
            to={mockVerifyPath(certificate.code)}
            state={{ certificate }}
            className={cn(buttonVariants())}
            data-testid="verify-certificate-cta"
          >
            Verificar este certificado
          </Link>
          <p className={styles['cert-cta__hint']}>
            Vista previa: así podrá cualquiera comprobar su autenticidad con el código, sin iniciar
            sesión.
          </p>
        </div>
      </div>
    </PageContainer>
  );
}

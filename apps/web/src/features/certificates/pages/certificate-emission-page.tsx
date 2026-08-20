import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { DonationCertificate } from '@adoptafacil/contracts';
import { buttonVariants, cn, EmptyState, Skeleton } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { ApiError, useApiClient } from '../../../shell/api';
import { fetchDonationCertificate } from '../api/donation-certificate';
import { CertificateDocument } from '../components/certificate-document';
import { certificateVerifyPath } from '../model/certificate-format';
import styles from './certificate-emission-page.module.scss';

/** Lo único que este paso necesita de la donación recién hecha (F-3): su id.
 *  El resto (organización, donante, monto) se lee del certificado REAL. */
interface EmissionNavState {
  donationId?: string;
}

type LoadState = 'loading' | 'ready' | 'not-available' | 'error';

/**
 * `/certificado` — certificado de donación REAL (RF14, F-3). Reemplaza la
 * maqueta de T-053: ya no hay datos de muestra ni "vista de diseño". El
 * certificado se emite automáticamente al aprobarse la donación (junto al
 * recibo), SOLO si la organización es una ESAL con RTE vigente — mientras
 * eso no ocurra (pago aún pendiente, u organización no elegible), esta
 * pantalla lo dice honestamente en vez de inventar un certificado.
 */
export function CertificateEmissionPage() {
  const location = useLocation();
  const client = useApiClient();
  const donationId = (location.state as EmissionNavState | null)?.donationId;

  const [state, setState] = useState<LoadState>(donationId ? 'loading' : 'not-available');
  const [certificate, setCertificate] = useState<DonationCertificate | null>(null);

  useEffect(() => {
    if (!donationId) return;
    let active = true;
    fetchDonationCertificate(client, donationId)
      .then((cert) => {
        if (active) {
          setCertificate(cert);
          setState('ready');
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        // 404 cubre dos casos honestos, con el mismo mensaje (nunca distinguidos
        // al donante): pago aún no aprobado, u organización no ESAL-RTE.
        setState(ApiError.is(error) && error.status === 404 ? 'not-available' : 'error');
      });
    return () => {
      active = false;
    };
  }, [client, donationId]);

  return (
    <PageContainer>
      <PageHeader
        title="Tu certificado de donación"
        description="Tras confirmarse tu donación, la organización emite un certificado verificable."
      />
      <div className="space-y-6">
        {state === 'loading' && <Skeleton className="h-72 w-full" />}
        {state === 'not-available' && (
          <EmptyState
            title="Certificado no disponible aún"
            description="El certificado se emite automáticamente junto con el recibo, al confirmarse tu pago — y solo si la organización es una ESAL con RTE vigente. Consulta 'Mis donaciones' más tarde."
          />
        )}
        {state === 'error' && (
          <EmptyState
            title="No se pudo cargar tu certificado"
            description="Inténtalo de nuevo más tarde."
          />
        )}
        {state === 'ready' && certificate && (
          <>
            <CertificateDocument certificate={certificate} />
            <div className={styles['cert-cta']}>
              <Link
                to={certificateVerifyPath(certificate.code)}
                className={cn(buttonVariants())}
                data-testid="verify-certificate-cta"
              >
                Verificar este certificado
              </Link>
              <p className={styles['cert-cta__hint']}>
                Así podrá cualquiera comprobar su autenticidad con el código, sin iniciar sesión.
              </p>
            </div>
          </>
        )}
      </div>
    </PageContainer>
  );
}

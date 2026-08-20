import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { DonationCertificateVerification } from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  EmptyState,
  Input,
  Skeleton,
} from '@adoptafacil/ui';
import { fetchPublicCertificateVerification } from '../api/donation-certificate';
import { formatBogota, formatCop } from '../model/certificate-format';
import styles from './certificate-verification-page.module.scss';

type VerifyState = 'idle' | 'loading' | 'valid' | 'invalid' | 'error';

/**
 * `/verificar/:code` — verificación PÚBLICA REAL de un certificado de donación
 * (RF14, F-3). Sin sesión: consulta `GET /public/donations/certificates/:code`
 * (SECURITY DEFINER, superficie mínima) y muestra la evidencia de
 * autenticidad, o un estado honesto de "no encontrado" — nunca datos
 * inventados ni una comparación local contra un código de muestra.
 */
export function CertificateVerificationPage() {
  const { code: codeParam } = useParams<{ code: string }>();
  const [code, setCode] = useState(codeParam ?? '');
  const [state, setState] = useState<VerifyState>('idle');
  const [result, setResult] = useState<DonationCertificateVerification | null>(null);

  const verify = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setState('loading');
    fetchPublicCertificateVerification(trimmed)
      .then((data) => {
        setResult(data);
        setState(data ? 'valid' : 'invalid');
      })
      .catch(() => setState('error'));
  };

  // Deep-link con :code → verifica automáticamente (el QR/enlace real).
  useEffect(() => {
    if (codeParam) verify(codeParam);
  }, [codeParam]);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Verificar un certificado de donación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className={styles.intro}>
              Ingresa el código único del certificado para comprobar su autenticidad.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                aria-label="Código del certificado"
                placeholder="ADF-CERT-2026-000742"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <Button onClick={() => verify(code)}>Verificar</Button>
            </div>
          </CardContent>
        </Card>

        {state === 'loading' && <Skeleton className="h-48 w-full" />}

        {state === 'valid' && result && (
          <Card data-testid="verification-result" className={styles.result}>
            <CardHeader className="gap-2">
              <div className={styles['result__title-row']}>
                <CardTitle>Certificado válido</CardTitle>
                <Badge variant="success">Auténtico</Badge>
              </div>
              <p className={styles['result__intro']}>
                Evidencia de autenticidad emitida por una ESAL con RTE vigente.
              </p>
            </CardHeader>
            <CardContent>
              <dl className={styles.evidence} data-testid="authenticity-evidence">
                <div>
                  <dt className={styles['evidence__label']}>Emisor</dt>
                  <dd className={styles['evidence__value']}>
                    {result.organizationName} · NIT {result.organizationNit}
                    <span className="ml-2 align-middle">
                      <Badge variant="success">ESAL · RTE</Badge>
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className={styles['evidence__label']}>Donante</dt>
                  <dd className={styles['evidence__value']}>{result.donorName}</dd>
                </div>
                <div>
                  <dt className={styles['evidence__label']}>Monto</dt>
                  <dd className={cn(styles['evidence__value'], styles['evidence__value--plain'])}>
                    {formatCop(result.amount)}
                  </dd>
                </div>
                <div>
                  <dt className={styles['evidence__label']}>Fecha de emisión</dt>
                  <dd className={cn(styles['evidence__value'], styles['evidence__value--plain'])}>
                    {formatBogota(result.issuedAt)}
                  </dd>
                </div>
                <div className={styles['evidence__wide']}>
                  <dt className={styles['evidence__label']}>Hash del documento</dt>
                  <dd className={styles['evidence__hash']}>{result.contentHash}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        )}

        {state === 'invalid' && (
          <EmptyState
            title="Código no encontrado"
            description="No pudimos verificar ese código. Revisa que esté completo e inténtalo de nuevo."
          />
        )}

        {state === 'error' && (
          <EmptyState title="No se pudo verificar" description="Inténtalo de nuevo más tarde." />
        )}
      </div>
    </main>
  );
}

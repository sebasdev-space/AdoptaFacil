import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { DonationCertificate, DonationWithReceipt } from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  buttonVariants,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { CertificateDocument } from '../../certificates/components/certificate-document';
import { certificateVerifyPath } from '../../certificates/model/certificate-format';
import { generateDonationCertificate } from '../api/donations-api';
import { breakdownLines, formatBogota, formatCop } from '../model/donation-breakdown-view';
import { DONATION_STATUS_BADGE_VARIANT, DONATION_STATUS_LABELS } from '../model/my-donations-view';
import { donationConceptLabel, receivedDonorLabel } from '../model/received-donations-view';
import styles from './donation-detail.module.scss';

export interface ReceivedDonationDetailModalProps {
  /** `null` cierra el modal (mismo patrón controlado de `DonationDetailModal`). */
  donation: DonationWithReceipt | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Modal de detalle de "Donaciones recibidas" (REFACTOR-VISUAL Fase C3) — vista
 * de la ORGANIZACIÓN sobre una donación que le llegó, hermana de
 * `DonationDetailModal` (la vista del donante en "Mis donaciones") pero sin el
 * enlace al certificado DEL DONANTE; la organización, en cambio, puede
 * "Generar certificado" de una donación aprobada (lo emite si faltaba —p. ej. la
 * organización se volvió ESAL-RTE después del pago— o reabre el MISMO ya emitido). Reutiliza `breakdownLines` sobre el desglose YA PERSISTIDO de la
 * donación, nunca recalculado (mismo criterio que `DonationDetailModal`: una
 * donación pasada debe seguir mostrando el desglose con el que se cobró
 * realmente). El donante solo se identifica si el recibo ya existe
 * (`receivedDonorLabel`) — nunca se fabrica un nombre para una donación aún
 * `pending`/`declined`.
 */
export function ReceivedDonationDetailModal({
  donation,
  onOpenChange,
}: ReceivedDonationDetailModalProps) {
  const client = useApiClient();
  const [certificate, setCertificate] = useState<DonationCertificate | null>(null);
  const [generating, setGenerating] = useState(false);
  const [certError, setCertError] = useState<string | null>(null);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setCertificate(null);
      setCertError(null);
    }
    onOpenChange(open);
  };

  const generateCertificate = async (donationId: string) => {
    setGenerating(true);
    setCertError(null);
    try {
      setCertificate(await generateDonationCertificate(client, donationId));
    } catch (error) {
      setCertError(
        error instanceof Error
          ? error.message
          : 'No se pudo generar el certificado. Inténtalo de nuevo.',
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={donation !== null} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="received-donation-detail-modal"
        className={cn('max-h-[90vh] overflow-y-auto', certificate && 'sm:max-w-2xl')}
      >
        {donation && (
          <>
            <DialogHeader className={certificate ? 'sr-only' : undefined}>
              <DialogTitle>{receivedDonorLabel(donation)}</DialogTitle>
              <DialogDescription>
                {donationConceptLabel(donation.concept)} · {formatBogota(donation.createdAt)}
              </DialogDescription>
            </DialogHeader>

            {certificate ? (
              <div className={styles.body} data-testid="received-donation-certificate">
                <CertificateDocument certificate={certificate} />
                <div className={styles.actions}>
                  <Link
                    to={certificateVerifyPath(certificate.code)}
                    className={cn(buttonVariants())}
                    data-testid="received-donation-verify-certificate"
                  >
                    Verificar este certificado
                  </Link>
                  <Button variant="outline" onClick={() => setCertificate(null)}>
                    Volver al detalle
                  </Button>
                </div>
              </div>
            ) : (
              <div className={styles.body}>
                <Badge variant={DONATION_STATUS_BADGE_VARIANT[donation.status]}>
                  {DONATION_STATUS_LABELS[donation.status]}
                </Badge>

                <dl className={styles.breakdown} data-testid="received-donation-detail-breakdown">
                  {breakdownLines(donation.breakdown).map((line) => (
                    <div
                      key={line.key}
                      className={cn(
                        styles.breakdown__line,
                        line.emphasis && styles['breakdown__line--emphasis'],
                      )}
                    >
                      <dt>{line.label}</dt>
                      <dd data-testid={`received-donation-detail-${line.key}`}>
                        {formatCop(line.amount)}
                      </dd>
                    </div>
                  ))}
                </dl>

                {donation.status === 'approved' && (
                  <div className={styles.actions}>
                    <Button
                      variant="outline"
                      disabled={generating}
                      onClick={() => void generateCertificate(donation.id)}
                      data-testid="received-donation-generate-certificate"
                    >
                      {generating ? 'Generando…' : 'Generar certificado'}
                    </Button>
                    {certError && (
                      <p
                        role="alert"
                        className={styles.error}
                        data-testid="received-donation-certificate-error"
                      >
                        {certError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

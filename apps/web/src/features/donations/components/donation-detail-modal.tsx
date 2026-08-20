import { Link } from 'react-router-dom';
import type { Donation } from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  buttonVariants,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@adoptafacil/ui';
import { breakdownLines, formatBogota, formatCop } from '../model/donation-breakdown-view';
import {
  DONATION_STATUS_BADGE_VARIANT,
  DONATION_STATUS_LABELS,
  organizationLabel,
} from '../model/my-donations-view';
import { donationConceptLabel } from '../model/received-donations-view';
import styles from './donation-detail.module.scss';

export interface DonationDetailModalProps {
  /** `null` cierra el modal (patrón controlado, igual que `ApplicantDetailModal`). */
  donation: Donation | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Modal de detalle de una donación propia (F-MIS-DONACIONES-PLUS), en "Mis
 * donaciones" (§M05). Muestra el desglose YA PERSISTIDO de la donación
 * (`donation.breakdown`, con las MISMAS etiquetas del checkout vía
 * `breakdownLines` — nunca se recalcula con `computeBreakdown`: si la tarifa
 * cambiara en el futuro, una donación histórica debe seguir mostrando el
 * desglose con el que realmente se cobró, no uno recalculado a la tarifa
 * vigente).
 *
 * El acceso al certificado REAL (RF14, F-3) solo se ofrece para donaciones
 * `approved` (el certificado se emite junto al recibo automático — y solo si
 * la organización es una ESAL con RTE vigente; `CertificateEmissionPage`
 * decide eso al leerlo del backend, este botón solo evita mostrarlo cuando
 * ni siquiera hay recibo todavía). El nav-state hacia `/certificado` solo
 * lleva el id de la donación — el certificado se lee del backend, nunca se
 * reconstruye desde aquí.
 */
export function DonationDetailModal({ donation, onOpenChange }: DonationDetailModalProps) {
  return (
    <Dialog open={donation !== null} onOpenChange={onOpenChange}>
      <DialogContent data-testid="donation-detail-modal">
        {donation && (
          <>
            <DialogHeader>
              <DialogTitle>{organizationLabel(donation)}</DialogTitle>
              <DialogDescription>
                {donationConceptLabel(donation.concept)} · {formatBogota(donation.createdAt)}
              </DialogDescription>
            </DialogHeader>

            <div className={styles.body}>
              <Badge variant={DONATION_STATUS_BADGE_VARIANT[donation.status]}>
                {DONATION_STATUS_LABELS[donation.status]}
              </Badge>

              <dl className={styles.breakdown} data-testid="donation-detail-breakdown">
                {breakdownLines(donation.breakdown).map((line) => (
                  <div
                    key={line.key}
                    className={cn(
                      styles.breakdown__line,
                      line.emphasis && styles['breakdown__line--emphasis'],
                    )}
                  >
                    <dt>{line.label}</dt>
                    <dd data-testid={`donation-detail-${line.key}`}>{formatCop(line.amount)}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <DialogFooter>
              {donation.status === 'approved' ? (
                <Link
                  to="/certificado"
                  state={{ donationId: donation.id }}
                  className={cn(buttonVariants())}
                  data-testid="view-certificate-from-detail"
                >
                  Ver / descargar certificado
                </Link>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled
                  title="El certificado se emite junto con el recibo automático, al aprobarse la donación."
                  data-testid="certificate-unavailable"
                >
                  Certificado no disponible aún
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

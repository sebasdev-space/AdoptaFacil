import type { DonationWithReceipt } from '@adoptafacil/contracts';
import {
  Badge,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@adoptafacil/ui';
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
 * enlace al certificado — ese es un artefacto del DONANTE, no de quien lo
 * recibe. Reutiliza `breakdownLines` sobre el desglose YA PERSISTIDO de la
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
  return (
    <Dialog open={donation !== null} onOpenChange={onOpenChange}>
      <DialogContent data-testid="received-donation-detail-modal">
        {donation && (
          <>
            <DialogHeader>
              <DialogTitle>{receivedDonorLabel(donation)}</DialogTitle>
              <DialogDescription>
                {donationConceptLabel(donation.concept)} · {formatBogota(donation.createdAt)}
              </DialogDescription>
            </DialogHeader>

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
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

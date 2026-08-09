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
 * vigente). El acceso al certificado (F-CERT-REAL, #101) solo se ofrece para
 * donaciones `approved` (el certificado se emite junto al recibo automático;
 * para pending/declined no existe recibo aún, así que el botón queda
 * deshabilitado con el motivo explícito, nunca oculto sin explicación ni
 * activo sin datos reales detrás).
 *
 * El nav-state hacia `/certificado` reconstruye EXACTAMENTE la forma que
 * `CertificateEmissionPage` ya sabe leer (mismo shape que `DonatePage` usa al
 * completarse una donación nueva): `donation` completa (de donde lee
 * `intendedAmount` y `payer.fullName`, el contacto real capturado al donar) +
 * `organizationName` (que `GET /donations/mine` SÍ resuelve). El NIT de la
 * organización NO viaja aquí a propósito: ese dato solo lo trae el portal
 * público de la org en el momento de donar (`DonationTarget.organizationNit`,
 * F2-03) y `/donations/mine` no lo re-resuelve para donaciones pasadas — el
 * certificado ya trata el NIT como opcional (`organizationNit?: string`) y lo
 * omite con elegancia cuando no llega, exactamente el caso aquí. No se
 * inventa ni se reutiliza el NIT de muestra.
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

            <div className="space-y-4 text-sm">
              <Badge variant={DONATION_STATUS_BADGE_VARIANT[donation.status]}>
                {DONATION_STATUS_LABELS[donation.status]}
              </Badge>

              <dl className="space-y-1.5" data-testid="donation-detail-breakdown">
                {breakdownLines(donation.breakdown).map((line) => (
                  <div
                    key={line.key}
                    className={
                      line.emphasis
                        ? 'flex items-center justify-between font-semibold'
                        : 'flex items-center justify-between text-muted-foreground'
                    }
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
                  state={{ donation, organizationName: donation.organizationName }}
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

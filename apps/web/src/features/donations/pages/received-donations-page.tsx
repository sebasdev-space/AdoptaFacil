import { useEffect, useState } from 'react';
import type { DonationWithReceipt } from '@adoptafacil/contracts';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { listReceivedDonations } from '../api/donations-api';
import { ReceivedDonationDetailModal } from '../components/received-donation-detail-modal';
import { formatBogota, formatCop } from '../model/donation-breakdown-view';
import { DONATION_STATUS_BADGE_VARIANT, DONATION_STATUS_LABELS } from '../model/my-donations-view';
import {
  donationConceptLabel,
  normalizeReceivedDonations,
  receivedDonorLabel,
} from '../model/received-donations-view';
import styles from './received-donations-page.module.scss';

/**
 * `/donaciones-recibidas` — donaciones recibidas por LA ORG (§M05, F-DONACIONES-
 * RECIBIDAS), la contraparte de gestión de "Mis donaciones" (que es del donante).
 * Consume `GET /donations/received` (backend ya existente, MANAGE_ROLES —
 * Owner/Administrador/Operador — gateado en el backend Y aquí vía
 * `<RequireRoles>` en `routes.tsx`, mismo patrón que F1-02 con "Adopciones").
 *
 * Todos los datos son REALES: el donante solo se identifica cuando la donación
 * está `approved` (el recibo trae `donor.fullName`/`email`) — para `pending`/
 * `declined` el contrato no expone ningún dato humano del donante, así que se
 * muestra "Recibo pendiente" en vez de fabricar un nombre o exponer el id crudo
 * (`receivedDonorLabel`). El concepto (a qué se destinó) tampoco resuelve nombre
 * de animal/campaña — se muestra el tipo + un id corto (`donationConceptLabel`).
 */
export function ReceivedDonationsPage() {
  const client = useApiClient();
  const [donations, setDonations] = useState<DonationWithReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailDonation = donations.find((d) => d.id === detailId) ?? null;

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const body = await listReceivedDonations(client);
        if (active) setDonations(normalizeReceivedDonations(body));
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client]);

  return (
    <PageContainer>
      <PageHeader
        title="Donaciones recibidas"
        description="Donaciones que han llegado a tu organización."
      />
      <Card>
        <CardHeader>
          <CardTitle>Historial</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <Skeleton className="h-64 w-full" />}
          {!loading && error && (
            <p className="text-sm text-destructive">
              No se pudieron cargar las donaciones recibidas. Inténtalo de nuevo más tarde.
            </p>
          )}
          {!loading && !error && donations.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Tu organización aún no ha recibido ninguna donación.
            </p>
          )}
          {!loading && !error && donations.length > 0 && (
            <ul className="space-y-3">
              {donations.map((donation) => (
                <li key={donation.id} className={styles.row} data-testid="received-donation-row">
                  <div className={styles.row__top}>
                    <span className={styles.row__donor} data-testid="received-donation-donor">
                      {receivedDonorLabel(donation)}
                    </span>
                    <Badge variant={DONATION_STATUS_BADGE_VARIANT[donation.status]}>
                      {DONATION_STATUS_LABELS[donation.status]}
                    </Badge>
                    <span className={styles.row__meta}>
                      {donationConceptLabel(donation.concept)}
                    </span>
                    <span className={styles.row__meta}>{formatBogota(donation.createdAt)}</span>
                    <span className={styles.row__amount} data-testid="received-donation-amount">
                      {formatCop(donation.breakdown.net)}
                    </span>
                  </div>
                  <div>
                    <Button variant="outline" onClick={() => setDetailId(donation.id)}>
                      Ver detalle
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <ReceivedDonationDetailModal
        donation={detailDonation}
        onOpenChange={(open) => !open && setDetailId(null)}
      />
    </PageContainer>
  );
}

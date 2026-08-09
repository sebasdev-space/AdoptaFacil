import { useEffect, useState } from 'react';
import type { Donation, DonationReceipt } from '@adoptafacil/contracts';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { getMyDonationReceipt, listMyDonations } from '../api/donations-api';
import { formatBogota, formatCop } from '../model/donation-breakdown-view';
import {
  DONATION_STATUS_BADGE_VARIANT,
  DONATION_STATUS_LABELS,
  normalizeDonations,
  organizationLabel,
} from '../model/my-donations-view';
import { DonationDetailModal } from './donation-detail-modal';

/** Inline expandable receipt for ONE approved donation (fetched on demand). */
function ReceiptDetail({ donationId }: { donationId: string }) {
  const client = useApiClient();
  const [receipt, setReceipt] = useState<DonationReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const r = await getMyDonationReceipt(client, donationId);
        if (active) setReceipt(r);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client, donationId]);

  if (loading) return <Skeleton className="h-20 w-full" />;
  if (error || !receipt) {
    return <p className="text-sm text-destructive">No se pudo cargar el recibo.</p>;
  }
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-xs uppercase text-muted-foreground">Emitido</dt>
        <dd>{formatBogota(receipt.issuedAt)}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase text-muted-foreground">Monto pretendido</dt>
        <dd>{formatCop(receipt.intendedAmount)}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase text-muted-foreground">Neto para la organización</dt>
        <dd>{formatCop(receipt.breakdown.net)}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase text-muted-foreground">Donante</dt>
        <dd>{receipt.donor.fullName ?? receipt.donor.email ?? 'Sin datos'}</dd>
      </div>
    </dl>
  );
}

/**
 * "Mis donaciones" (T-064) — historial de donaciones de la Persona autenticada,
 * vía `GET /donations/mine` (cross-tenant por identidad, T-050). Completa el
 * placeholder que antes solo mostraba un empty-state estático cuando `/donaciones`
 * se abría SIN una organización objetivo (p. ej. desde el menú lateral).
 *
 * `Donation` solo trae `organizationId` (sin nombre) — no hay endpoint que
 * resuelva id→nombre de una org arbitraria; se muestra un identificador corto en
 * vez de fabricar un nombre (ver `organizationLabel`).
 */
export function MyDonationsList() {
  const client = useApiClient();
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailDonation = donations.find((d) => d.id === detailId) ?? null;

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const body = await listMyDonations(client);
        if (active) setDonations(normalizeDonations(body));
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

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mis donaciones</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="text-sm text-destructive">
            No se pudieron cargar tus donaciones. Inténtalo de nuevo más tarde.
          </p>
        )}
        {!error && donations.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aún no has hecho ninguna donación. Entra al portal público de una organización para
            donar.
          </p>
        )}
        {!error && donations.length > 0 && (
          <ul className="space-y-3">
            {donations.map((donation) => (
              <li key={donation.id} className="border-b pb-3 text-sm last:border-b-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{organizationLabel(donation)}</span>
                  <Badge variant={DONATION_STATUS_BADGE_VARIANT[donation.status]}>
                    {DONATION_STATUS_LABELS[donation.status]}
                  </Badge>
                  <span className="text-muted-foreground">{formatBogota(donation.createdAt)}</span>
                  <span className="ml-auto font-medium">{formatCop(donation.amountCharged)}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setDetailId(donation.id)}>
                    Ver detalle
                  </Button>
                  {donation.status === 'approved' && (
                    <Button
                      variant="outline"
                      onClick={() => setExpanded(expanded === donation.id ? null : donation.id)}
                    >
                      {expanded === donation.id ? 'Ocultar recibo' : 'Ver recibo'}
                    </Button>
                  )}
                </div>
                {donation.status === 'approved' && expanded === donation.id && (
                  <div className="mt-2">
                    <ReceiptDetail donationId={donation.id} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <DonationDetailModal
        donation={detailDonation}
        onOpenChange={(open) => !open && setDetailId(null)}
      />
    </Card>
  );
}

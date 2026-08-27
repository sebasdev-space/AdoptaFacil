import { useEffect, useState } from 'react';
import type { Sponsorship } from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { listMySponsorships, retrySponsorshipPayment } from '../api/sponsorships-api';
import {
  formatBogota,
  formatCop,
  isBillingFailureSuspension,
  isPaymentAtRisk,
  normalizeSponsorships,
  SPONSORSHIP_PERIODICITY_LABELS,
  SPONSORSHIP_STATUS_LABELS,
  sponsorshipStatusVariant,
} from '../model/sponsorships-view';
import styles from './my-sponsorships-list.module.scss';

/**
 * "Mis apadrinamientos" (S2-03) — historial de apadrinamientos de la Persona
 * autenticada, vía `GET /sponsorships/mine` (cross-tenant por identidad, S2-03
 * — mismo patrón que `MyDonationsList`/`GET /donations/mine`, T-064).
 *
 * ⚠️ Hallazgo (S2-03, encontrado en verificación visual): el historial de
 * estado (`GET /sponsorships/:id/history`) está gateado a Owner/Administrator/
 * ReadOnlyAuditor (`SponsorshipsController.VIEW_ROLES`) — el propio padrino NO
 * puede verlo (403/tenant mismatch). El Prompt Spec condicionaba el historial a
 * "si el endpoint ya las expone"; como NO lo expone para el padrino, se omite
 * aquí en vez de mostrar un botón que siempre falla. Documentado en el reporte
 * de cierre — requeriría OTRO endpoint nuevo tipo `sponsorship_history_for_sponsor`,
 * mismo patrón que `sponsorships_for_sponsor`, no agregado sin acordarlo antes.
 */
export function MySponsorshipsList() {
  const client = useApiClient();
  const { toast } = useToast();
  const [sponsorships, setSponsorships] = useState<Sponsorship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    const body = await listMySponsorships(client);
    setSponsorships(normalizeSponsorships(body));
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const body = await listMySponsorships(client);
        if (active) setSponsorships(normalizeSponsorships(body));
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

  const retryPayment = async (sponsorship: Sponsorship): Promise<void> => {
    setRetryingId(sponsorship.id);
    try {
      await retrySponsorshipPayment(client, sponsorship.id);
      await load();
      toast({
        title: 'Nuevo cobro generado',
        description: 'Cuando se confirme el pago, tu apadrinamiento se reactivará automáticamente.',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'No se pudo generar un nuevo cobro',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setRetryingId(null);
    }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mis apadrinamientos</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <p className={styles['hint--error']}>
            No se pudieron cargar tus apadrinamientos. Inténtalo de nuevo más tarde.
          </p>
        )}
        {!error && sponsorships.length === 0 && (
          <p className={styles.hint}>
            Aún no apadrinas a ningún animal. Entra al detalle de un animal en el portal público de
            una organización para apadrinarlo.
          </p>
        )}
        {!error && sponsorships.length > 0 && (
          <ul className="space-y-3">
            {sponsorships.map((sponsorship) => (
              <li key={sponsorship.id} className={styles.row}>
                <div className={styles.row__top}>
                  <span className={styles.row__name}>
                    {sponsorship.animalName ?? sponsorship.animalId}
                  </span>
                  <Badge variant={sponsorshipStatusVariant(sponsorship.status)}>
                    {SPONSORSHIP_STATUS_LABELS[sponsorship.status]}
                  </Badge>
                  <span className={styles.row__meta}>
                    {sponsorship.organizationName ?? sponsorship.organizationId}
                  </span>
                  {sponsorship.planAmount !== undefined && (
                    <span className={styles.row__amount}>
                      {formatCop(sponsorship.planAmount)}
                      {sponsorship.planPeriodicity &&
                        ` / ${SPONSORSHIP_PERIODICITY_LABELS[sponsorship.planPeriodicity].toLowerCase()}`}
                    </span>
                  )}
                </div>
                <p className={styles.row__sub}>
                  Desde {formatBogota(sponsorship.startedAt)}
                  {sponsorship.planName ? ` · ${sponsorship.planName}` : ''}
                </p>
                {isPaymentAtRisk(sponsorship) && (
                  <p className={styles['hint--error']}>
                    Pago pendiente — intento {sponsorship.currentPeriodAttemptCount} de 3. Si no se
                    confirma pronto, el apadrinamiento se suspenderá.
                  </p>
                )}
                {isBillingFailureSuspension(sponsorship) && (
                  <div className="flex items-center gap-2">
                    <p className={styles['hint--error']}>Suspendido por pago fallido.</p>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={retryingId === sponsorship.id}
                      onClick={() => void retryPayment(sponsorship)}
                    >
                      {retryingId === sponsorship.id ? 'Generando…' : 'Pagar de nuevo'}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

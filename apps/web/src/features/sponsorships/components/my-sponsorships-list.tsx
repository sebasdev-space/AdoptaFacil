import { useEffect, useState } from 'react';
import type { Sponsorship } from '@adoptafacil/contracts';
import { Badge, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { listMySponsorships } from '../api/sponsorships-api';
import {
  formatBogota,
  formatCop,
  normalizeSponsorships,
  SPONSORSHIP_PERIODICITY_LABELS,
  SPONSORSHIP_STATUS_LABELS,
  sponsorshipStatusVariant,
} from '../model/sponsorships-view';

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
  const [sponsorships, setSponsorships] = useState<Sponsorship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mis apadrinamientos</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="text-sm text-destructive">
            No se pudieron cargar tus apadrinamientos. Inténtalo de nuevo más tarde.
          </p>
        )}
        {!error && sponsorships.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aún no apadrinas a ningún animal. Entra al detalle de un animal en el portal público de
            una organización para apadrinarlo.
          </p>
        )}
        {!error && sponsorships.length > 0 && (
          <ul className="space-y-3">
            {sponsorships.map((sponsorship) => (
              <li key={sponsorship.id} className="border-b pb-3 text-sm last:border-b-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {sponsorship.animalName ?? sponsorship.animalId}
                  </span>
                  <Badge variant={sponsorshipStatusVariant(sponsorship.status)}>
                    {SPONSORSHIP_STATUS_LABELS[sponsorship.status]}
                  </Badge>
                  <span className="text-muted-foreground">
                    {sponsorship.organizationName ?? sponsorship.organizationId}
                  </span>
                  {sponsorship.planAmount !== undefined && (
                    <span className="ml-auto font-medium">
                      {formatCop(sponsorship.planAmount)}
                      {sponsorship.planPeriodicity &&
                        ` / ${SPONSORSHIP_PERIODICITY_LABELS[sponsorship.planPeriodicity].toLowerCase()}`}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Desde {formatBogota(sponsorship.startedAt)}
                  {sponsorship.planName ? ` · ${sponsorship.planName}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

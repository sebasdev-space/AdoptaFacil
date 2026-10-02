import { useEffect, useState } from 'react';
import { CampaignStatus, Role, type OrgDonationsDashboardSummary } from '@adoptafacil/contracts';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  StatCard,
} from '@adoptafacil/ui';
import { formatCop } from '../../donations';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';

const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  [CampaignStatus.Active]: 'Activa',
  [CampaignStatus.Closed]: 'Cerrada',
  [CampaignStatus.Cancelled]: 'Cancelada',
};

function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * `/organizacion/dashboard-donaciones` (M13, S-14 — pedido del cliente): "un
 * módulo tipo Dashboard informativo de donaciones... según el rol pueda ver
 * la información a la que tiene acceso". Cada sección (donaciones/campañas/
 * apadrinamientos) se muestra SOLO si `GET /org/dashboard/donations` la trae
 * — el backend ya decide eso según el rol real del actor, exactamente los
 * MISMOS roles que hoy ven cada dato en su propio módulo
 * (`GET /donations/received`, `GET /campaigns`, `GET /sponsorships`). Esta
 * página nunca inventa un permiso nuevo ni oculta localmente algo que el
 * backend ya decidió mostrar.
 *
 * "Contrato de donación" (lo que pidió literalmente el cliente: "cuántos
 * contratos en proceso/rechazados") NO existe todavía en el sistema — la
 * sección de Donaciones muestra el estado de la DONACIÓN (pendiente/
 * aprobada/rechazada), nunca un dato de contrato fabricado, y lo deja
 * explícito en el propio texto de la tarjeta.
 */
export function OrgDonationsDashboardPage() {
  const client = useApiClient();
  const { hasAnyRole } = useSession();
  // Unión de las 3 secciones del backend (`OrgDonationsDashboardController`'s
  // `@Roles`) — mismos 4 roles que `ORG_DONATIONS_DASHBOARD_ROLES` del menú
  // (shell/navigation/nav-items.ts).
  const canView = hasAnyRole(Role.Owner, Role.Administrator, Role.Operator, Role.ReadOnlyAuditor);

  const [summary, setSummary] = useState<OrgDonationsDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!canView) return;
    let active = true;
    void (async () => {
      try {
        const data = await client.request<OrgDonationsDashboardSummary>('/org/dashboard/donations');
        if (active) setSummary(data);
      } catch {
        if (active) setErrored(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client, canView]);

  if (!canView) {
    return (
      <PageContainer>
        <PageHeader title="Donaciones y campañas" description="Acceso restringido." />
        <EmptyState title="Sin acceso" description="No tienes permisos para ver este dashboard." />
      </PageContainer>
    );
  }

  const nothingVisible =
    summary !== null && !summary.donations && !summary.campaigns && !summary.sponsorships;

  return (
    <PageContainer>
      <PageHeader
        title="Donaciones y campañas"
        description="Lo que tu rol puede ver de donaciones, campañas y apadrinamientos."
      />
      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      )}

      {!loading && errored && (
        <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
      )}

      {!loading && !errored && summary && nothingVisible && (
        <EmptyState
          title="Nada que mostrar aquí"
          description="Tu rol no tiene acceso a ninguna de las secciones de este dashboard."
        />
      )}

      {!loading && !errored && summary && (
        <div className="space-y-6">
          {summary.donations && (
            <Card>
              <CardHeader>
                <CardTitle>Donaciones</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Estado de la donación — el contrato de donación todavía no existe en el sistema.
                </p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard label="Pendientes" value={summary.donations.pending} />
                  <StatCard label="Aprobadas" value={summary.donations.approved} />
                  <StatCard label="Rechazadas" value={summary.donations.declined} />
                  <StatCard
                    label="Total neto recibido"
                    value={formatCop(summary.donations.netReceivedTotal)}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {summary.campaigns && (
            <Card>
              <CardHeader>
                <CardTitle>Campañas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {summary.campaigns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Esta organización no tiene campañas registradas.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {summary.campaigns.map((campaign) => (
                      <li
                        key={campaign.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                      >
                        <div className="space-y-1">
                          <p className="font-medium">{campaign.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatCop(campaign.raisedAmount)} de {formatCop(campaign.goalAmount)} ·
                            Vence {formatDeadline(campaign.deadline)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              campaign.status === CampaignStatus.Active ? 'success' : 'secondary'
                            }
                          >
                            {CAMPAIGN_STATUS_LABELS[campaign.status]}
                          </Badge>
                          {campaign.endingSoon && <Badge variant="warning">Vence pronto</Badge>}
                          <span className="text-sm font-semibold">
                            {Math.round(campaign.progress * 100)}%
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          {summary.sponsorships && (
            <Card>
              <CardHeader>
                <CardTitle>Apadrinamientos — salud de facturación</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard label="Activos" value={summary.sponsorships.active} />
                  <StatCard label="Suspendidos" value={summary.sponsorships.suspended} />
                  <StatCard label="Cancelados" value={summary.sponsorships.cancelled} />
                  <StatCard
                    label="En riesgo de pago"
                    value={summary.sponsorships.atPaymentRisk}
                    accessory={
                      summary.sponsorships.atPaymentRisk > 0 ? (
                        <Badge variant="destructive">Revisar</Badge>
                      ) : undefined
                    }
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </PageContainer>
  );
}

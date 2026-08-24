import { useEffect, useState } from 'react';
import { Role, type PlatformSuperAdminDashboardSummary } from '@adoptafacil/contracts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  StatCard,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { VERIFICATION_LEVEL_LABELS } from '../verification-level-labels';

/** Formatea pesos enteros COP (sin decimales), es-CO. */
function formatCop(pesos: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(pesos);
}

/**
 * `/plataforma/dashboard/financiero` (RF24, M13, S-8) — SOLO
 * PlatformSuperAdmin: indicadores financieros agregados de plataforma
 * (nunca visibles a un PlatformAdmin normal), indicadores de negocio y
 * distribución de organizaciones por departamento.
 *
 * El documento base pide "mapa de Colombia" para esta audiencia — el
 * proyecto no tiene ningún activo geográfico de Colombia (geojson/SVG/
 * librería de mapas) disponible hoy, así que esto se entrega como una
 * lista/gráfico de barras horizontal con datos reales y correctamente
 * agregados, no como un mapa aproximado o inventado. Un mapa interactivo
 * real queda como TODO(client) / tarea de diseño aparte.
 */
export function PlatformSuperAdminDashboardPage() {
  const client = useApiClient();
  const { hasRole } = useSession();
  const canView = hasRole(Role.PlatformSuperAdmin);

  const [summary, setSummary] = useState<PlatformSuperAdminDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const data = await client.request<Partial<PlatformSuperAdminDashboardSummary>>(
          '/platform/dashboard/super-admin',
        );
        if (active) {
          setSummary({
            grossTotal: data?.grossTotal ?? 0,
            platformFeeTotal: data?.platformFeeTotal ?? 0,
            gatewayFeeTotal: data?.gatewayFeeTotal ?? 0,
            netTotal: data?.netTotal ?? 0,
            organizationsByVerificationLevel: Array.isArray(data?.organizationsByVerificationLevel)
              ? data.organizationsByVerificationLevel
              : [],
            activeAnimals: data?.activeAnimals ?? 0,
            totalAdoptions: data?.totalAdoptions ?? 0,
            activeCampaigns: data?.activeCampaigns ?? 0,
            activeSponsorships: data?.activeSponsorships ?? 0,
            organizationsByDepartment: Array.isArray(data?.organizationsByDepartment)
              ? data.organizationsByDepartment
              : [],
          });
        }
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
        <PageHeader title="Dashboard financiero" description="Acceso restringido." />
        <EmptyState title="Sin acceso" description="Solo PlatformSuperAdmin." />
      </PageContainer>
    );
  }

  const maxDepartmentCount = summary
    ? Math.max(1, ...summary.organizationsByDepartment.map((d) => d.count))
    : 1;

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard financiero"
        description="Indicadores financieros y de negocio de toda la plataforma."
      />
      {loading && <Skeleton className="h-96 w-full" />}
      {!loading && summary && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Finanzas de plataforma</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total bruto" value={formatCop(summary.grossTotal)} />
              <StatCard
                label="Comisión de plataforma"
                value={formatCop(summary.platformFeeTotal)}
              />
              <StatCard label="Comisión de pasarela" value={formatCop(summary.gatewayFeeTotal)} />
              <StatCard label="Neto a organizaciones" value={formatCop(summary.netTotal)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Indicadores de negocio</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Animales activos" value={summary.activeAnimals} />
              <StatCard label="Adopciones totales" value={summary.totalAdoptions} />
              <StatCard label="Campañas activas" value={summary.activeCampaigns} />
              <StatCard label="Apadrinamientos activos" value={summary.activeSponsorships} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Organizaciones por nivel de verificación</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              {summary.organizationsByVerificationLevel.map((row) => (
                <StatCard
                  key={row.level}
                  label={VERIFICATION_LEVEL_LABELS[row.level] ?? `Nivel ${row.level}`}
                  value={row.count}
                />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Organizaciones por departamento</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.organizationsByDepartment.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin datos todavía.</p>
              ) : (
                <ul className="space-y-2">
                  {summary.organizationsByDepartment.map((row) => (
                    <li key={row.department} className="flex items-center gap-3 text-sm">
                      <span className="w-40 shrink-0 truncate">{row.department}</span>
                      <div className="h-4 flex-1 rounded bg-muted">
                        <div
                          className="h-4 rounded bg-primary"
                          style={{ width: `${(row.count / maxDepartmentCount) * 100}%` }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right">{row.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}

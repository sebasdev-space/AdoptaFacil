import { useEffect, useState } from 'react';
import {
  type OrganizationDepartmentCount,
  Role,
  type PlatformSuperAdminDashboardSummary,
} from '@adoptafacil/contracts';
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
import {
  COLOMBIA_DEPARTMENT_PATHS,
  COLOMBIA_MAP_VIEWBOX,
  SAN_ANDRES_INSET,
} from '../data/colombia-department-paths';
import { VERIFICATION_LEVEL_LABELS } from '../verification-level-labels';

/** Formatea pesos enteros COP (sin decimales), es-CO. */
function formatCop(pesos: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(pesos);
}

/** "▲12%" / "▼8%" / "▬0%" para el delta de `StatCard` (RF28). */
function formatGrowthDelta(growthRatePct: number): { label: string; direction: 'up' | 'down' } {
  const rounded = Math.round(growthRatePct * 10) / 10;
  const arrow = rounded > 0 ? '▲' : rounded < 0 ? '▼' : '▬';
  return {
    label: `${arrow} ${rounded > 0 ? '+' : ''}${rounded}% vs. mes anterior`,
    direction: rounded < 0 ? 'down' : 'up',
  };
}

/**
 * Choropleth de Colombia por departamento (S-9): reemplaza la antigua lista/
 * barras — el proyecto ahora sí tiene un activo geográfico real (ver
 * `colombia-department-paths.ts`, generado desde la división política 2018 de
 * DANE, no aproximado a mano). Un departamento con `count === 0` (incluye
 * cualquiera que ni siquiera aparezca en `data`) se pinta con el mismo
 * `--muted` que el resto de la UI; el resto usa `--primary` (el mismo teal de
 * marca que ya coloreaban las barras) con opacidad proporcional a
 * `count / max`, un ramp secuencial de un solo tono. `title` por `<path>` da
 * tooltip nativo + nombre accesible sin JS adicional. Cualquier entrada de
 * `data` cuyo `department` no matchee ningún path conocido (typo, "Sin
 * especificar", u otro valor libre no cubierto por `colombian-locations.ts`)
 * se lista aparte para que ese dato nunca desaparezca silenciosamente.
 */
function ColombiaChoropleth({ data }: { data: OrganizationDepartmentCount[] }) {
  const countByDepartment = new Map(data.map((row) => [row.department, row.count]));
  const maxCount = Math.max(1, ...data.map((row) => row.count));
  const knownDepartments = new Set(COLOMBIA_DEPARTMENT_PATHS.map((f) => f.department));
  const unmatched = data.filter((row) => !knownDepartments.has(row.department));

  return (
    <div className="space-y-3">
      <svg
        viewBox={COLOMBIA_MAP_VIEWBOX}
        role="img"
        aria-label="Mapa de Colombia con organizaciones registradas por departamento"
        className="mx-auto h-auto w-full max-w-xs"
      >
        <rect
          x={SAN_ANDRES_INSET.x - 4}
          y={SAN_ANDRES_INSET.y - 4}
          width={SAN_ANDRES_INSET.size + 8}
          height={SAN_ANDRES_INSET.size + 8}
          rx={4}
          className="fill-none stroke-muted-foreground/40"
          strokeWidth={1}
          strokeDasharray="2 2"
        />
        {COLOMBIA_DEPARTMENT_PATHS.map((feature) => {
          const count = countByDepartment.get(feature.department) ?? 0;
          const fill =
            count === 0
              ? 'hsl(var(--muted))'
              : `hsl(var(--primary) / ${0.18 + 0.82 * (count / maxCount)})`;
          return (
            <path
              key={feature.department}
              d={feature.path}
              fill={fill}
              className="stroke-card"
              strokeWidth={0.75}
            >
              <title>
                {feature.department}: {count} {count === 1 ? 'organización' : 'organizaciones'}
              </title>
            </path>
          );
        })}
      </svg>
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <span>0</span>
        <div
          className="h-2 w-32 rounded-full"
          style={{
            background: 'linear-gradient(to right, hsl(var(--muted)), hsl(var(--primary)))',
          }}
        />
        <span>{maxCount} org.</span>
      </div>
      {unmatched.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {unmatched.map((row) => (
            <li key={row.department}>
              {row.department}: {row.count}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * `/plataforma/dashboard/financiero` (RF24, M13, S-8; RF28 growth y mapa real
 * añadidos en S-9) — SOLO PlatformSuperAdmin: indicadores financieros
 * agregados de plataforma (nunca visibles a un PlatformAdmin normal),
 * indicadores de negocio (incluida la tasa de crecimiento mensual de
 * organizaciones registradas, RF28) y distribución geográfica de
 * organizaciones por departamento como choropleth (ver `ColombiaChoropleth`).
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
            organizationsGrowth: data?.organizationsGrowth ?? {
              currentPeriodCount: 0,
              previousPeriodCount: 0,
              growthRatePct: 0,
            },
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
              <StatCard
                label="Organizaciones registradas (últimos 30 días)"
                value={summary.organizationsGrowth.currentPeriodCount}
                delta={formatGrowthDelta(summary.organizationsGrowth.growthRatePct)}
              />
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
                <ColombiaChoropleth data={summary.organizationsByDepartment} />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}

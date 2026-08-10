import { useCallback, useEffect, useState } from 'react';
import {
  PLATFORM_ROLES,
  Role,
  type HealthStatus,
  type OrganizationDashboardSummary,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@adoptafacil/ui';
import { formatCop } from '../../donations';
import { fetchHealth } from '../../../lib/api';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { fetchOrgSummary } from '../api/dashboard-api';
import { PageContainer, PageHeader } from '../page';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: HealthStatus }
  | { status: 'error'; message: string };

/** Roles that may see the org summary — MUST match the backend's
 *  `OrganizationSummaryController.VIEW_ROLES` (S2-08) so the fetch is never
 *  attempted for a role the API would 403. */
const SUMMARY_ROLES = [Role.Owner, Role.Administrator, Role.Operator] as const;

type SummaryState =
  | { status: 'loading' }
  | { status: 'ready'; data: OrganizationDashboardSummary }
  | { status: 'error' };

function SummaryStat({
  label,
  value,
  hint,
  badge,
}: {
  label: string;
  value: string;
  hint?: string;
  badge?: { text: string; variant: 'warning' | 'destructive' };
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="text-2xl font-bold tracking-tight">{value}</span>
          {badge && <Badge variant={badge.variant}>{badge.text}</Badge>}
          {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusRow({ label, value, up }: { label: string; value: string; up: boolean }) {
  return (
    <li className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      {/* F1-03-COMPLETO: el cruce reportado sobre el contraste de
          `variant="success"` (~4.10:1) ya fue resuelto por F-BADGE en
          `packages/ui/src/styles/globals.css` (~4.80:1, verificado de nuevo en
          REFACTOR-VISUAL Fase A) — nada que hacer aquí. */}
      <Badge variant={up ? 'success' : 'destructive'}>{value}</Badge>
    </li>
  );
}

/**
 * Portal home ("Inicio"). Two independent, role-gated blocks:
 *
 * - Org summary (M13, S2-08): stat cards from `GET /org/summary`, gated to
 *   Owner/Administrator/Operator (`SUMMARY_ROLES`, mirrors the backend's
 *   `VIEW_ROLES` exactly). Fills the gap REFACTOR-VISUAL Fase C3 flagged as
 *   "no existe todavía" — now that the read-only aggregate exists, this
 *   renders it without inventing any field the endpoint doesn't return (no
 *   time series, no gross/commission/net breakdown).
 * - System-health check (walking-skeleton, browser → API → Postgres/Redis),
 *   kept for platform admins.
 *
 * F-VISUAL-02: the health block is internal/technical (raw `/health`, db/redis
 * wording) — a Persona or Org user should never see it. Gated to a platform
 * admin (PlatformAdmin/PlatformSuperAdmin, `PLATFORM_ROLES` from contracts)
 * using the SAME session role mechanism as every other guarded surface
 * (`useSession().hasAnyRole`, T-025) — no ad-hoc check. Both blocks skip their
 * fetch entirely for a role that can't see them, not just hide the result.
 */
export function HomePage() {
  const { hasAnyRole } = useSession();
  const client = useApiClient();
  const isPlatformAdmin = hasAnyRole(...PLATFORM_ROLES);
  const canViewSummary = hasAnyRole(...SUMMARY_ROLES);

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [summary, setSummary] = useState<SummaryState>({ status: 'loading' });

  const load = useCallback(() => {
    setState({ status: 'loading' });
    fetchHealth()
      .then((data) => setState({ status: 'ready', data }))
      .catch((error: unknown) =>
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Error desconocido',
        }),
      );
  }, []);

  const loadSummary = useCallback(() => {
    setSummary({ status: 'loading' });
    fetchOrgSummary(client)
      .then((data) => setSummary({ status: 'ready', data }))
      .catch(() => setSummary({ status: 'error' }));
  }, [client]);

  useEffect(() => {
    if (isPlatformAdmin) load();
  }, [isPlatformAdmin, load]);

  useEffect(() => {
    if (canViewSummary) loadSummary();
  }, [canViewSummary, loadSummary]);

  return (
    <PageContainer>
      <PageHeader title="Inicio" description="Portal AdoptaFácil — navegación y transparencia." />

      {canViewSummary && (
        <div className="mb-6">
          {summary.status === 'loading' && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          )}

          {summary.status === 'error' && (
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                <p className="text-sm text-destructive">No se pudo cargar el resumen.</p>
                <Button variant="outline" size="sm" onClick={loadSummary}>
                  Reintentar
                </Button>
              </CardContent>
            </Card>
          )}

          {summary.status === 'ready' && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryStat label="Animales activos" value={String(summary.data.animalsActive)} />
              <SummaryStat
                label="Solicitudes pendientes"
                value={String(summary.data.adoptionRequestsPending)}
              />
              <SummaryStat
                label="Apadrinamientos activos"
                value={String(summary.data.sponsorshipsActive)}
              />
              <SummaryStat
                label="Donaciones recibidas"
                value={formatCop(summary.data.donationsReceivedTotal)}
              />
              <SummaryStat
                label="Documentos por vencer"
                value={String(summary.data.documentsExpiringSoon)}
                badge={
                  summary.data.documentsExpiringSoon > 0
                    ? { text: 'Revisar', variant: 'warning' }
                    : undefined
                }
              />
              <SummaryStat
                label="Documentos rechazados"
                value={String(summary.data.documentsRejected)}
                badge={
                  summary.data.documentsRejected > 0
                    ? { text: 'Subsanar', variant: 'destructive' }
                    : undefined
                }
              />
              <SummaryStat
                label="Formalización"
                value={`Nivel ${summary.data.formalizationLevel}`}
                hint={`${summary.data.formalizationPercent}%`}
              />
            </div>
          )}
        </div>
      )}

      {isPlatformAdmin && (
        <Card className="max-w-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle>Estado del sistema</CardTitle>
              <CardDescription>Conectividad del backend (API · Postgres · Redis).</CardDescription>
            </div>
            <Button size="sm" onClick={load} disabled={state.status === 'loading'}>
              {state.status === 'loading' ? 'Cargando…' : 'Refrescar'}
            </Button>
          </CardHeader>
          <CardContent>
            {state.status === 'loading' && (
              <p className="text-sm text-muted-foreground">Consultando /health…</p>
            )}

            {state.status === 'error' && (
              <p className="text-sm text-destructive">
                No se pudo contactar la API: {state.message}
              </p>
            )}

            {state.status === 'ready' && (
              <ul className="divide-y">
                <StatusRow
                  label="status"
                  value={state.data.status}
                  up={state.data.status === 'ok'}
                />
                <StatusRow label="db" value={state.data.db} up={state.data.db === 'up'} />
                <StatusRow label="redis" value={state.data.redis} up={state.data.redis === 'up'} />
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}

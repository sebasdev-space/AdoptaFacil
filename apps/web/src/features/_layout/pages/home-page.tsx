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
  ProgressStepper,
  Skeleton,
  StatCard,
} from '@adoptafacil/ui';
import { formatCop } from '../../donations';
import { fetchHealth } from '../../../lib/api';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { fetchOrgSummary } from '../api/dashboard-api';
import { formatLongDateEs, greetingLabel } from '../model/greeting';
import { formalizationSteps, formalizationStepIndex } from '../model/formalization-stepper-view';
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

interface ActionItem {
  key: string;
  label: string;
  href: string;
  linkLabel: string;
}

/**
 * "Requiere tu acción" — SOLO a partir de los conteos reales que YA trae
 * `GET /org/summary` (S2-08). El mockup de referencia muestra 4 acciones con
 * detalle específico (montos, nombre de animal, nombre de documento) que ese
 * endpoint no expone — inventar esos detalles violaría "sin cifras
 * inventadas". Esta versión es la interpretación honesta: mismo propósito
 * (qué necesita atención hoy), solo con lo que el backend YA agrega.
 */
function deriveActionItems(data: OrganizationDashboardSummary): ActionItem[] {
  const items: ActionItem[] = [];
  if (data.adoptionRequestsPending > 0) {
    items.push({
      key: 'adoptions',
      label: `${data.adoptionRequestsPending} solicitud${data.adoptionRequestsPending === 1 ? '' : 'es'} de adopción sin revisar`,
      href: '/adopciones',
      linkLabel: 'Ir a la bandeja',
    });
  }
  if (data.documentsExpiringSoon > 0) {
    items.push({
      key: 'expiring',
      label: `${data.documentsExpiringSoon} documento${data.documentsExpiringSoon === 1 ? '' : 's'} institucional${data.documentsExpiringSoon === 1 ? '' : 'es'} por vencer`,
      href: '/organizacion/documentos',
      linkLabel: 'Ver documentos',
    });
  }
  if (data.documentsRejected > 0) {
    items.push({
      key: 'rejected',
      label: `${data.documentsRejected} documento${data.documentsRejected === 1 ? '' : 's'} rechazado${data.documentsRejected === 1 ? '' : 's'} · pendiente de subsanar`,
      href: '/organizacion/documentos',
      linkLabel: 'Subsanar',
    });
  }
  return items;
}

/**
 * Portal home ("Inicio"). Two independent, role-gated blocks:
 *
 * - Org summary (M13, S2-08): saludo real + "requiere tu acción" (derivado de
 *   los mismos conteos) + stat cards + formalización, todo desde
 *   `GET /org/summary`, gated a Owner/Administrator/Operator (`SUMMARY_ROLES`,
 *   mirrors the backend's `VIEW_ROLES` exactly). Sin serie de tiempo, sin
 *   desglose bruto/comisión/neto — ese dato no existe en el backend todavía
 *   (S2-08 lo dejó fuera de alcance a propósito).
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
  const { hasAnyRole, user } = useSession();
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

  const now = new Date();
  const description = canViewSummary
    ? `${greetingLabel(now)}, ${user?.name} · ${formatLongDateEs(now)}`
    : 'Portal AdoptaFácil — navegación y transparencia.';

  return (
    <PageContainer>
      <PageHeader title="Inicio" description={description} />

      {canViewSummary && (
        <div className="mb-6 space-y-6">
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
            <>
              {deriveActionItems(summary.data).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      Requiere tu acción · {deriveActionItems(summary.data).length}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {deriveActionItems(summary.data).map((item) => (
                      <div
                        key={item.key}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-3"
                      >
                        <span className="text-sm">{item.label}</span>
                        <a href={item.href} className="text-sm font-semibold text-primary">
                          {item.linkLabel} →
                        </a>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Animales activos" value={summary.data.animalsActive} />
                <StatCard
                  label="Solicitudes pendientes"
                  value={summary.data.adoptionRequestsPending}
                />
                <StatCard label="Apadrinamientos activos" value={summary.data.sponsorshipsActive} />
                <StatCard
                  label="Donaciones recibidas"
                  value={formatCop(summary.data.donationsReceivedTotal)}
                />
                <StatCard
                  label="Documentos por vencer"
                  value={summary.data.documentsExpiringSoon}
                  accessory={
                    summary.data.documentsExpiringSoon > 0 ? (
                      <Badge variant="warning">Revisar</Badge>
                    ) : undefined
                  }
                />
                <StatCard
                  label="Documentos rechazados"
                  value={summary.data.documentsRejected}
                  accessory={
                    summary.data.documentsRejected > 0 ? (
                      <Badge variant="destructive">Subsanar</Badge>
                    ) : undefined
                  }
                />
                <StatCard
                  label="Formalización"
                  value={`Nivel ${summary.data.formalizationLevel}`}
                  accessory={
                    <span className="text-sm text-muted-foreground">
                      {summary.data.formalizationPercent}%
                    </span>
                  }
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Formalización</CardTitle>
                  <CardDescription>
                    Nivel {summary.data.formalizationLevel} · {summary.data.formalizationPercent}%
                    completado
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ProgressStepper
                    steps={formalizationSteps()}
                    currentIndex={formalizationStepIndex(summary.data.formalizationPercent)}
                  />
                </CardContent>
              </Card>
            </>
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

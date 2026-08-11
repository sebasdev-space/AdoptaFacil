import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { CampaignAccountabilityReport, CampaignPublic } from '@adoptafacil/contracts';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from '@adoptafacil/ui';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { getCampaignAccountability, getPublicCampaign } from '../api/public-campaigns';
import { CampaignProgress } from '../components/campaign-progress';
import {
  CATEGORY_LABELS,
  EVIDENCE_TYPE_LABELS,
  STATUS_LABELS,
  campaignStatusVariant,
  formatBogota,
  formatCop,
} from '../model/campaigns-view';

type DetailState = 'loading' | 'ready' | 'not-found' | 'error';

interface CampaignNavState {
  campaign?: CampaignPublic;
}

/**
 * Detalle PÚBLICO de una campaña (§M14/M06) en `/campanas/:id`. Sin autenticación;
 * columnas públicas de `CampaignPublic`. Llega por nav-state desde la tarjeta o se
 * resuelve por `GET /public/campaigns/:id` en deep-link (404 → no encontrado). El
 * avance se muestra tal cual (hoy 0). A diferencia de la lista pública (solo activas),
 * el detalle muestra el estado real de la campaña (activa/finalizada/cancelada).
 */
export function PublicCampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const preloaded = (location.state as CampaignNavState | null)?.campaign;

  const [campaign, setCampaign] = useState<CampaignPublic | null>(preloaded ?? null);
  const [state, setState] = useState<DetailState>(preloaded ? 'ready' : 'loading');
  const [report, setReport] = useState<CampaignAccountabilityReport | null>(null);

  useEffect(() => {
    if (preloaded || !id) {
      if (!id) setState('not-found');
      return;
    }
    let active = true;
    getPublicCampaign(id)
      .then((found) => {
        if (!active) return;
        setCampaign(found);
        setState(found ? 'ready' : 'not-found');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [preloaded, id]);

  // Accountability report (RF16) — loaded independently of the campaign detail so
  // it works both on deep links and when the campaign came via nav-state. A
  // failure/404 simply leaves the section empty (never breaks the page).
  useEffect(() => {
    if (!id) return;
    let active = true;
    getCampaignAccountability(id)
      .then((found) => {
        if (active) setReport(found);
      })
      .catch(() => {
        if (active) setReport(null);
      });
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicNavbar />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <Link to="/campanas" className="text-sm text-primary hover:underline">
          ← Volver a campañas
        </Link>

        <div className="mt-4">
          {state === 'loading' && <Skeleton className="h-72 w-full" />}
          {state === 'not-found' && (
            <EmptyState
              title="Campaña no encontrada"
              description="Esta campaña no existe o el enlace no es válido."
            />
          )}
          {state === 'error' && (
            <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
          )}
          {state === 'ready' && campaign && (
            <Card data-testid="public-campaign-detail">
              <CardHeader className="gap-2">
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {campaign.title}
                  <Badge variant="secondary">{CATEGORY_LABELS[campaign.category]}</Badge>
                  <Badge variant={campaignStatusVariant(campaign.status)}>
                    {STATUS_LABELS[campaign.status]}
                  </Badge>
                </CardTitle>
                <p className="text-sm text-muted-foreground">{campaign.organizationName}</p>
              </CardHeader>
              <CardContent className="space-y-6">
                {campaign.description && (
                  <p className="text-sm text-foreground">{campaign.description}</p>
                )}
                <CampaignProgress
                  raisedAmount={campaign.raisedAmount}
                  goalAmount={campaign.goalAmount}
                  progress={campaign.progress}
                />
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">Meta</dt>
                    <dd className="text-sm font-medium">{formatCop(campaign.goalAmount)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-muted-foreground">Fecha límite</dt>
                    <dd className="text-sm">{formatBogota(campaign.deadline)}</dd>
                  </div>
                </dl>

                {/* Rendición de cuentas (RF16 · T-054): evidencias públicas de gasto
                    + suma declarada. NO se muestra "% ejecutado" (el recaudo real
                    llega en T-055); solo lo cargado y su total. */}
                <section aria-labelledby="accountability-heading" className="border-t pt-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 id="accountability-heading" className="text-sm font-bold">
                      Rendición de cuentas
                    </h2>
                    {report && report.evidences.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        Gasto declarado:{' '}
                        <span className="font-medium text-foreground">
                          {formatCop(report.totalSpent)}
                        </span>
                      </span>
                    )}
                  </div>

                  {report && report.evidences.length > 0 ? (
                    <ul className="mt-4 space-y-3" data-testid="accountability-evidences">
                      {report.evidences.map((evidence) => (
                        <li
                          key={evidence.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                        >
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 text-sm font-medium">
                              <Badge variant="secondary">
                                {EVIDENCE_TYPE_LABELS[evidence.type]}
                              </Badge>
                              <span className="truncate">{evidence.concept}</span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatBogota(evidence.spentAt)}
                              {typeof evidence.amount === 'number' &&
                                ` · ${formatCop(evidence.amount)}`}
                            </p>
                          </div>
                          <a
                            href={evidence.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline"
                          >
                            Ver soporte
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Esta campaña aún no ha publicado evidencias de rendición.
                    </p>
                  )}
                </section>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}

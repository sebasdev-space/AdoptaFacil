import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import type { SponsorshipPlanPublic, SponsorshipPublicSummary } from '@adoptafacil/contracts';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { fetchAnimalSponsorshipSummary } from '../api/public-sponsorships';
import { subscribeToPlan } from '../api/sponsorships-api';
import { formatCop, SPONSORSHIP_PERIODICITY_LABELS } from '../model/sponsorships-view';
import { MySponsorshipsList } from '../components/my-sponsorships-list';
import styles from './sponsor-page.module.scss';

interface SponsorTarget {
  animalId: string;
  /** Opcionales: quien enlaza aquí (p. ej. el detalle público de un animal, §M14)
   *  puede pasarlos para una mejor presentación; sin ellos, se muestra el id
   *  corto en vez de fabricar un nombre (mismo criterio que donations). */
  animalName?: string;
  organizationName?: string;
}

/** Resuelve el animal objetivo desde nav-state o query param (mismo patrón que
 *  `useDonationTarget` en donations/pages/donate-page.tsx). */
function useSponsorTarget(): SponsorTarget | null {
  const location = useLocation();
  const [params] = useSearchParams();
  return useMemo(() => {
    const state = (location.state as { target?: SponsorTarget } | null)?.target;
    if (state?.animalId) return state;

    const animalId = params.get('animalId');
    if (!animalId) return null;
    return {
      animalId,
      animalName: params.get('animalName') ?? undefined,
      organizationName: params.get('organizationName') ?? undefined,
    };
  }, [location.state, params]);
}

type SummaryState = 'loading' | 'ready' | 'error';

/**
 * `/apadrinar` (S2-03, RF17) — apadrinar un animal (plan mensual único, §6
 * Consolidación Ola 2) o, sin animal objetivo, "Mis apadrinamientos" (mismo
 * doble-propósito que `/donaciones`). El punto de entrada real (botón en el
 * detalle público de un animal) es de `features/portals` (dominio de Fabián,
 * fuera de alcance aquí) — cualquier enlace `/apadrinar?animalId=...` ya
 * funciona end-to-end.
 */
export function SponsorPage() {
  const client = useApiClient();
  const { toast } = useToast();
  const target = useSponsorTarget();

  const [summary, setSummary] = useState<SponsorshipPublicSummary | null>(null);
  const [summaryState, setSummaryState] = useState<SummaryState>('loading');
  const [subscribingPlanId, setSubscribingPlanId] = useState<string | null>(null);
  // `POST /sponsorships` returns the bare Sponsorship row (no planAmount/planName —
  // those are ONLY resolved by `GET /sponsorships/mine`, see the contract comments
  // on `Sponsorship`), so the confirmation message uses the PLAN we already fetched
  // from the public summary, not the subscribe response.
  const [done, setDone] = useState<SponsorshipPlanPublic | null>(null);

  useEffect(() => {
    if (!target) return;
    let active = true;
    setSummaryState('loading');
    fetchAnimalSponsorshipSummary(target.animalId)
      .then((result) => {
        if (active) {
          setSummary(result);
          setSummaryState('ready');
        }
      })
      .catch(() => {
        if (active) setSummaryState('error');
      });
    return () => {
      active = false;
    };
  }, [target]);

  if (!target) {
    return (
      <PageContainer>
        <PageHeader
          title="Mis apadrinamientos"
          description="Historial de tus apadrinamientos. Para apadrinar, entra al detalle de un animal en el portal público de una organización."
        />
        <MySponsorshipsList />
      </PageContainer>
    );
  }

  const animalLabel = target.animalName ?? target.animalId;

  const sponsor = async (plan: SponsorshipPlanPublic): Promise<void> => {
    setSubscribingPlanId(plan.id);
    try {
      await subscribeToPlan(client, { planId: plan.id });
      setDone(plan);
      toast({ title: 'Apadrinamiento creado', description: `Ahora apadrinas a ${animalLabel}.` });
    } catch (error) {
      toast({
        title: 'No se pudo procesar el apadrinamiento',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSubscribingPlanId(null);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Apadrinar"
        description={`Tu apadrinamiento mensual para ${animalLabel}.`}
      />
      <Card>
        <CardHeader>
          <CardTitle>{animalLabel}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {done ? (
            <EmptyState
              title="¡Gracias por apadrinar!"
              description={`Registramos tu apadrinamiento mensual de ${formatCop(done.amount)} para ${animalLabel}. Pago simulado (PAYMENT_DRIVER=fake) — la pasarela real llega en una versión futura.`}
            />
          ) : (
            <>
              {summaryState === 'loading' && <Skeleton className="h-32 w-full" />}
              {summaryState === 'error' && (
                <p className={styles['hint--error']}>
                  No se pudo cargar la información de apadrinamiento. Inténtalo de nuevo más tarde.
                </p>
              )}
              {summaryState === 'ready' && summary && summary.activePlans.length === 0 && (
                <p className={styles.hint}>
                  Este animal no tiene un plan de apadrinamiento activo por ahora.
                </p>
              )}
              {summaryState === 'ready' && summary && summary.activePlans.length > 0 && (
                <div className="space-y-3">
                  <p className={styles.hint}>
                    {summary.activeSponsorCount === 1
                      ? 'Ya tiene 1 padrino activo.'
                      : `Ya tiene ${summary.activeSponsorCount} padrinos activos.`}
                  </p>
                  <ul className={styles.plans}>
                    {summary.activePlans.map((plan) => (
                      <li key={plan.id} className={styles['plan-row']}>
                        <div>
                          <p className={styles['plan-row__name']}>{plan.name}</p>
                          <p className={styles['plan-row__meta']}>
                            {formatCop(plan.amount)} /{' '}
                            {SPONSORSHIP_PERIODICITY_LABELS[plan.periodicity].toLowerCase()}
                          </p>
                        </div>
                        <Button
                          disabled={subscribingPlanId === plan.id}
                          onClick={() => void sponsor(plan)}
                        >
                          {subscribingPlanId === plan.id ? 'Procesando…' : 'Apadrinar'}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}

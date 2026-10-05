import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type {
  Sponsorship,
  SponsorshipPlanPublic,
  SponsorshipPublicSummary,
} from '@adoptafacil/contracts';
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
import { isIncompleteProfileError, useApiClient } from '../../../shell/api';
import { CardPaymentBrick, type CardPaymentBrickResult } from '../../payments';
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
  const location = useLocation();
  const navigate = useNavigate();

  const [summary, setSummary] = useState<SponsorshipPublicSummary | null>(null);
  const [summaryState, setSummaryState] = useState<SummaryState>('loading');
  const [subscribingPlanId, setSubscribingPlanId] = useState<string | null>(null);
  // Requerimiento #17: "Apadrinar" abre el Card Payment Brick EN LÍNEA para
  // ese plan (mismo patrón que "Pagar de nuevo" en `MySponsorshipsList`) — el
  // cobro real solo se dispara al enviarlo, nunca al click inicial.
  const [payingPlanId, setPayingPlanId] = useState<string | null>(null);
  // `POST /sponsorships` devuelve el Sponsorship real (incluido
  // `firstPaymentStatus`, el resultado síncrono del cobro) — el PLAN se
  // conserva aparte solo para el nombre/monto que el mensaje final muestra
  // (no vienen en la respuesta, ver los comentarios del contrato `Sponsorship`).
  const [done, setDone] = useState<{
    plan: SponsorshipPlanPublic;
    sponsorship: Sponsorship;
  } | null>(null);

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

  const sponsor = async (
    plan: SponsorshipPlanPublic,
    card: CardPaymentBrickResult,
  ): Promise<void> => {
    setSubscribingPlanId(plan.id);
    try {
      const sponsorship = await subscribeToPlan(client, {
        planId: plan.id,
        cardToken: card.cardToken,
        paymentMethodId: card.paymentMethodId,
        paymentMethodType: card.paymentMethodType,
        installments: card.installments,
      });
      setDone({ plan, sponsorship });
      toast(
        sponsorship.firstPaymentStatus === 'approved'
          ? {
              title: '¡Pago aprobado!',
              description: `Cobramos ${formatCop(plan.amount)} y ya apadrinas a ${animalLabel}.`,
              variant: 'success',
            }
          : {
              title: 'Apadrinamiento creado',
              description: `Ahora apadrinas a ${animalLabel}. Estamos confirmando tu pago.`,
            },
      );
    } catch (error) {
      // T-Google-SignIn (business rule #3): apadrinar requires a complete
      // profile (phone/documentId/address).
      if (isIncompleteProfileError(error)) {
        navigate('/perfil/completar', {
          state: {
            from: location,
            reason:
              'Antes de apadrinar necesitamos tu teléfono, documento de identidad y dirección.',
          },
        });
        return;
      }
      toast({
        title: 'No se pudo procesar el apadrinamiento',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
      // Deja el Brick abierto para reintentar con otra tarjeta y re-lanza
      // para que `CardPaymentBrick` también muestre su propio estado de
      // error (mismo contrato que `MySponsorshipsList.payWithCard`).
      throw error;
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
              description={
                done.sponsorship.firstPaymentStatus === 'approved'
                  ? `Cobramos ${formatCop(done.plan.amount)} de inmediato. ¡Gracias por apadrinar a ${animalLabel}!`
                  : `Registramos tu apadrinamiento mensual de ${formatCop(done.plan.amount)} para ${animalLabel}. Estamos confirmando tu pago — te avisaremos por correo en cuanto se confirme.`
              }
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
                        <div className="flex w-full items-center justify-between gap-2">
                          <div>
                            <p className={styles['plan-row__name']}>{plan.name}</p>
                            <p className={styles['plan-row__meta']}>
                              {formatCop(plan.amount)} /{' '}
                              {SPONSORSHIP_PERIODICITY_LABELS[plan.periodicity].toLowerCase()}
                            </p>
                          </div>
                          {payingPlanId !== plan.id && (
                            <Button onClick={() => setPayingPlanId(plan.id)}>Apadrinar</Button>
                          )}
                        </div>
                        {/* El Brick se abre EN LÍNEA — el cobro real solo se
                            dispara al enviarlo (mismo patrón que "Pagar de
                            nuevo" en `MySponsorshipsList`). */}
                        {payingPlanId === plan.id && (
                          <div className="w-full space-y-2">
                            <CardPaymentBrick
                              amount={plan.amount}
                              onResult={(card) => sponsor(plan, card)}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={subscribingPlanId === plan.id}
                              onClick={() => setPayingPlanId(null)}
                            >
                              Cancelar
                            </Button>
                          </div>
                        )}
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

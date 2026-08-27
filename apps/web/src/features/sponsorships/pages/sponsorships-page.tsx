import { useEffect, useState } from 'react';
import type { Animal, Sponsorship, SponsorshipPlan } from '@adoptafacil/contracts';
import { Role, SponsorshipStatus } from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Skeleton,
  StatCard,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import {
  cancelSponsorship,
  listOrgPlans,
  listOrgSponsorships,
  reactivateSponsorship,
  suspendSponsorship,
} from '../api/sponsorships-api';
import { AnimalDeceasedModal } from '../components/animal-deceased-modal';
import {
  computeSponsorshipMetrics,
  formatBogota,
  formatCop,
  isPaymentAtRisk,
  shortId,
  SPONSORSHIP_STATUS_LABELS,
  sponsorDisplayName,
  sponsorshipStatusVariant,
} from '../model/sponsorships-view';
import styles from './sponsorships-page.module.scss';

/**
 * `/organizacion/apadrinamientos` (S2-03, RF17; rediseño T-DASH-APADRINAMIENTOS)
 * — apadrinamientos recibidos por la organización, usando SOLO endpoints ya
 * existentes (`GET /sponsorships`, `GET /sponsorship-plans`, `POST
 * /sponsorships/:id/{suspend,reactivate,cancel}`) + el nuevo campo
 * `Sponsorship.sponsorName` (T-057, ver sponsorships.prisma).
 *
 * Gestionar (suspender/reactivar/cancelar): Owner/Administrator, calcado
 * VERBATIM de `SponsorshipsController.MANAGE_ROLES`. Ver: + ReadOnlyAuditor
 * (`VIEW_ROLES`). Sin Operator en ninguno de los dos (hallazgo S2-03: RF17 es
 * dinero recurrente, más sensible que Campañas/Donaciones).
 *
 * Tarjetas de métricas — TODAS calculadas de datos ya cargados, ninguna
 * inventada:
 *  - Padrinos activos / Ingreso mensual / Animales apadrinados: reales,
 *    `computeSponsorshipMetrics` sobre los apadrinamientos + planes ya en
 *    memoria (mismo criterio que el resto del proyecto: sin agregado nuevo de
 *    backend si se puede derivar del que ya existe).
 *  - En riesgo de suspensión (S-5-REDISEÑO, T-057): apadrinamientos con un
 *    período de cobro `pending` y 2+ intentos ya usados (de 3) — dato REAL
 *    desde `Sponsorship.currentPeriodStatus`/`currentPeriodAttemptCount`,
 *    ahora que el cobro recurrente quedó conectado.
 */
export function SponsorshipsPage() {
  const client = useApiClient();
  const { hasRole } = useSession();
  const canManage = hasRole(Role.Owner) || hasRole(Role.Administrator);
  const { toast } = useToast();

  const [sponsorships, setSponsorships] = useState<Sponsorship[]>([]);
  const [plansById, setPlansById] = useState<Map<string, SponsorshipPlan>>(new Map());
  const [animalNamesById, setAnimalNamesById] = useState<Map<string, string>>(new Map());
  const [animalsTotalCount, setAnimalsTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Sponsorship | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [deceasedTarget, setDeceasedTarget] = useState<Sponsorship | null>(null);

  const applyLoaded = (
    sponsorshipRows: Sponsorship[],
    planRows: SponsorshipPlan[],
    animals: Animal[],
  ): void => {
    setSponsorships(sponsorshipRows);
    setPlansById(new Map(planRows.map((p) => [p.id, p])));
    setAnimalNamesById(new Map(animals.map((a) => [a.id, a.name])));
    setAnimalsTotalCount(animals.filter((a) => a.isActive !== false).length);
  };

  const load = async (): Promise<void> => {
    const [sponsorshipRows, planRows, animals] = await Promise.all([
      listOrgSponsorships(client),
      listOrgPlans(client),
      client.request<Animal[]>('/animals?includeInactive=true'),
    ]);
    applyLoaded(sponsorshipRows, planRows, animals);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [sponsorshipRows, planRows, animals] = await Promise.all([
          listOrgSponsorships(client),
          listOrgPlans(client),
          client.request<Animal[]>('/animals?includeInactive=true'),
        ]);
        if (active) applyLoaded(sponsorshipRows, planRows, animals);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client]);

  const transition = async (
    action: 'suspend' | 'reactivate',
    sponsorship: Sponsorship,
  ): Promise<void> => {
    setBusyId(sponsorship.id);
    try {
      if (action === 'suspend') {
        await suspendSponsorship(client, sponsorship.id);
      } else {
        await reactivateSponsorship(client, sponsorship.id);
      }
      await load();
      toast({
        title: action === 'suspend' ? 'Apadrinamiento suspendido' : 'Apadrinamiento reactivado',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'No se pudo actualizar el apadrinamiento',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  };

  // Cancel is TERMINAL (no reactivation after, `SponsorshipStatus` doc) — same
  // confirm-dialog pattern as `AnimalsPage`'s delete, unlike suspend/reactivate
  // above which are reversible and fire on a single click.
  async function confirmCancel(): Promise<void> {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await cancelSponsorship(client, cancelTarget.id);
      await load();
      toast({ title: 'Apadrinamiento cancelado', variant: 'success' });
      setCancelTarget(null);
    } catch (error) {
      toast({
        title: 'No se pudo cancelar el apadrinamiento',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setCancelling(false);
    }
  }

  const metrics = computeSponsorshipMetrics(sponsorships, plansById, animalsTotalCount);

  return (
    <PageContainer>
      <PageHeader
        title="Apadrinamientos"
        description="Planes activos por animal y padrinos de tu organización."
      />
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && sponsorships.length === 0 && (
        <EmptyState
          icon={<span aria-hidden>💚</span>}
          title="Aún no hay apadrinamientos"
          description="Cuando alguien apadrine uno de tus animales, aparecerá aquí."
        />
      )}
      {!loading && sponsorships.length > 0 && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Padrinos activos" value={metrics.activePadrinosCount} />
            <StatCard label="Ingreso mensual" value={formatCop(metrics.monthlyIncomeTotal)} />
            <StatCard
              label="Animales apadrinados"
              value={`${metrics.animalsSponsoredCount} / ${metrics.animalsTotalCount}`}
            />
            <StatCard label="En riesgo de suspensión" value={metrics.atRiskCount} />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Padrino</TableHead>
                <TableHead>Animal</TableHead>
                <TableHead>Aporte / mes</TableHead>
                <TableHead>Estado</TableHead>
                {canManage && <TableHead>Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sponsorships.map((sponsorship) => {
                const plan = plansById.get(sponsorship.planId);
                const animalName = animalNamesById.get(sponsorship.animalId);
                return (
                  <TableRow key={sponsorship.id}>
                    <TableCell>
                      <div>
                        <p className={styles['cell__primary']}>{sponsorDisplayName(sponsorship)}</p>
                        <p className={styles['cell__sub']}>
                          Desde {formatBogota(sponsorship.startedAt)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{animalName ?? shortId(sponsorship.animalId)}</TableCell>
                    <TableCell>{plan ? `${formatCop(plan.amount)}/mes` : '—'}</TableCell>
                    <TableCell>
                      <Badge variant={sponsorshipStatusVariant(sponsorship.status)}>
                        {SPONSORSHIP_STATUS_LABELS[sponsorship.status]}
                      </Badge>
                      {isPaymentAtRisk(sponsorship) && (
                        <Badge variant="warning">
                          Pago pendiente ({sponsorship.currentPeriodAttemptCount}/3)
                        </Badge>
                      )}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        {sponsorship.status !== SponsorshipStatus.Cancelled && (
                          <div className={styles.actions}>
                            {sponsorship.status === SponsorshipStatus.Active ? (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busyId === sponsorship.id}
                                onClick={() => void transition('suspend', sponsorship)}
                              >
                                Suspender
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busyId === sponsorship.id}
                                onClick={() => void transition('reactivate', sponsorship)}
                              >
                                Reactivar
                              </Button>
                            )}
                            {sponsorship.status === SponsorshipStatus.Active && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busyId === sponsorship.id}
                                onClick={() => setDeceasedTarget(sponsorship)}
                              >
                                Registrar fallecimiento
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className={styles['cancel-btn']}
                              disabled={busyId === sponsorship.id}
                              onClick={() => setCancelTarget(sponsorship)}
                            >
                              Cancelar
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={cancelTarget !== null} onOpenChange={(next) => !next && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar apadrinamiento</DialogTitle>
            <DialogDescription>
              Esta acción es definitiva: un apadrinamiento cancelado no puede reactivarse. ¿Quieres
              continuar?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={cancelling}>
              Volver
            </Button>
            <Button
              className={styles['confirm-btn--danger']}
              onClick={() => void confirmCancel()}
              disabled={cancelling}
            >
              {cancelling ? 'Cancelando…' : 'Sí, cancelar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AnimalDeceasedModal
        open={deceasedTarget !== null}
        onOpenChange={(open) => !open && setDeceasedTarget(null)}
        animalName={
          deceasedTarget
            ? (animalNamesById.get(deceasedTarget.animalId) ?? shortId(deceasedTarget.animalId))
            : ''
        }
        activeSponsorCount={
          deceasedTarget
            ? sponsorships.filter(
                (s) =>
                  s.animalId === deceasedTarget.animalId && s.status === SponsorshipStatus.Active,
              ).length
            : 0
        }
      />
    </PageContainer>
  );
}

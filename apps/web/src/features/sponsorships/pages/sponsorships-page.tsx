import { useEffect, useState } from 'react';
import type { Animal, Sponsorship, SponsorshipPlan } from '@adoptafacil/contracts';
import { Role, SponsorshipStatus } from '@adoptafacil/contracts';
import { Badge, Button, EmptyState, Skeleton, useToast } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import {
  listOrgPlans,
  listOrgSponsorships,
  reactivateSponsorship,
  suspendSponsorship,
} from '../api/sponsorships-api';
import {
  formatBogota,
  formatCop,
  shortId,
  SPONSORSHIP_STATUS_LABELS,
  sponsorshipStatusVariant,
} from '../model/sponsorships-view';

/**
 * `/organizacion/apadrinamientos` (S2-03, RF17) — apadrinamientos recibidos por
 * la organización, usando SOLO endpoints ya existentes (`GET /sponsorships`,
 * `GET /sponsorship-plans`, `POST /sponsorships/:id/{suspend,reactivate}`).
 *
 * Gestionar (suspender/reactivar): Owner/Administrator, calcado VERBATIM de
 * `SponsorshipsController.MANAGE_ROLES`. Ver: + ReadOnlyAuditor (`VIEW_ROLES`).
 * ⚠️ Hallazgo (S2-03): el Prompt Spec original asumía que Operator también
 * gestiona/ve apadrinamientos (como en Campañas/Donaciones); el backend REAL
 * de `SponsorshipsController` NO incluye Operator en ninguno de los dos
 * conjuntos — documentado en el reporte de cierre, no corregido por cuenta
 * propia (podría ser intencional: RF17 es dinero recurrente, más sensible).
 *
 * `GET /sponsorships` no resuelve nombres de plan/animal (eso solo lo hace
 * `GET /sponsorships/mine` para el padrino) — como la organización SÍ tiene
 * acceso RLS normal a sus propios planes/animales, se resuelven aquí con dos
 * fetches adicionales a endpoints YA existentes (sin nuevo backend).
 */
export function SponsorshipsPage() {
  const client = useApiClient();
  const { hasRole } = useSession();
  const canManage = hasRole(Role.Owner) || hasRole(Role.Administrator);
  const { toast } = useToast();

  const [sponsorships, setSponsorships] = useState<Sponsorship[]>([]);
  const [plansById, setPlansById] = useState<Map<string, SponsorshipPlan>>(new Map());
  const [animalNamesById, setAnimalNamesById] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    const [sponsorshipRows, planRows, animals] = await Promise.all([
      listOrgSponsorships(client),
      listOrgPlans(client),
      client.request<Animal[]>('/animals?includeInactive=true'),
    ]);
    setSponsorships(sponsorshipRows);
    setPlansById(new Map(planRows.map((p) => [p.id, p])));
    setAnimalNamesById(new Map(animals.map((a) => [a.id, a.name])));
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
        if (active) {
          setSponsorships(sponsorshipRows);
          setPlansById(new Map(planRows.map((p) => [p.id, p])));
          setAnimalNamesById(new Map(animals.map((a) => [a.id, a.name])));
        }
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

  return (
    <PageContainer>
      <PageHeader
        title="Apadrinamientos"
        description="Apadrinamientos recibidos por tu organización."
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
        <ul className="space-y-3">
          {sponsorships.map((sponsorship) => {
            const plan = plansById.get(sponsorship.planId);
            const animalName = animalNamesById.get(sponsorship.animalId);
            return (
              <li key={sponsorship.id} className="rounded-md border p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{animalName ?? shortId(sponsorship.animalId)}</span>
                  <Badge variant={sponsorshipStatusVariant(sponsorship.status)}>
                    {SPONSORSHIP_STATUS_LABELS[sponsorship.status]}
                  </Badge>
                  {plan && (
                    <span className="ml-auto font-medium">{formatCop(plan.amount)}/mes</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {plan ? plan.name : `Plan ${shortId(sponsorship.planId)}`} · Desde{' '}
                  {formatBogota(sponsorship.startedAt)}
                </p>
                {canManage && sponsorship.status !== SponsorshipStatus.Cancelled && (
                  <div className="mt-2">
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
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </PageContainer>
  );
}

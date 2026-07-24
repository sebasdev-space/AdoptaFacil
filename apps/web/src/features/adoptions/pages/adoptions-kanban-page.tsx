import { useCallback, useEffect, useState } from 'react';
import { Role, type AdoptionRequest, type AdoptionStatus } from '@adoptafacil/contracts';
import { Badge, Button, Card, CardContent, EmptyState, Skeleton, useToast } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { listAdoptionRequests, transitionAdoptionRequest } from '../api/adoptions-api';
import {
  ADOPTION_COLUMNS,
  ADOPTION_NEXT_STATUSES,
  ADOPTION_STATUS_LABELS,
  adoptionStatusVariant,
  formatBogota,
} from '../model/adoptions-view';

/**
 * `/adopciones` — tablero de EVALUACIÓN de la organización (§M04, T-028a).
 * Nuevas → En evaluación → Aprobada/Rechazada, con transiciones auditadas en el
 * backend (UTC; aquí se muestra en hora Colombia). Gating deny-by-default:
 * Owner/Administrador/Operador (la autoridad real la impone RolesGuard en la API).
 */
export function AdoptionsKanbanPage() {
  const client = useApiClient();
  const { hasAnyRole } = useSession();
  const { toast } = useToast();
  const canEvaluate = hasAnyRole(Role.Owner, Role.Administrator, Role.Operator);

  const [requests, setRequests] = useState<AdoptionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [movingId, setMovingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    listAdoptionRequests(client)
      .then(setRequests)
      .catch(() =>
        toast({ title: 'No se pudieron cargar las solicitudes', variant: 'destructive' }),
      )
      .finally(() => setLoading(false));
  }, [client, toast]);

  useEffect(() => {
    if (canEvaluate) load();
    else setLoading(false);
  }, [canEvaluate, load]);

  const move = useCallback(
    async (request: AdoptionRequest, targetStatus: AdoptionStatus) => {
      setMovingId(request.id);
      try {
        const updated = await transitionAdoptionRequest(client, request.id, { targetStatus });
        setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        toast({ title: `Solicitud movida a "${ADOPTION_STATUS_LABELS[targetStatus]}"` });
      } catch {
        toast({ title: 'No se pudo mover la solicitud', variant: 'destructive' });
      } finally {
        setMovingId(null);
      }
    },
    [client, toast],
  );

  if (!canEvaluate) {
    return (
      <PageContainer>
        <PageHeader title="Adopciones" description="Evaluación de solicitudes de adopción." />
        <EmptyState
          title="Sin acceso"
          description="Solo Owner, Administrador u Operador pueden evaluar solicitudes de adopción."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Adopciones"
        description="Tablero de evaluación: mueve cada solicitud por sus estados. Las transiciones quedan auditadas."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {ADOPTION_COLUMNS.map((column) => {
          const items = requests.filter((r) => r.status === column);
          return (
            <section
              key={column}
              aria-label={ADOPTION_STATUS_LABELS[column]}
              className="flex flex-col gap-3 rounded-lg bg-muted/40 p-3"
            >
              <header className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">{ADOPTION_STATUS_LABELS[column]}</h2>
                <Badge variant={adoptionStatusVariant(column)}>{items.length}</Badge>
              </header>

              {loading ? (
                <Skeleton className="h-24 w-full" />
              ) : items.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">Sin solicitudes.</p>
              ) : (
                items.map((request) => (
                  <Card key={request.id} data-testid="adoption-card">
                    <CardContent className="space-y-2 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{request.animalSnapshot.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatBogota(request.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{request.applicant.fullName}</p>
                      <p className="line-clamp-3 text-xs text-muted-foreground">
                        {request.message}
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {ADOPTION_NEXT_STATUSES[request.status].map((target) => (
                          <Button
                            key={target}
                            size="sm"
                            variant={target === 'rejected' ? 'outline' : 'default'}
                            disabled={movingId === request.id}
                            onClick={() => void move(request, target)}
                          >
                            {ADOPTION_STATUS_LABELS[target]}
                          </Button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </section>
          );
        })}
      </div>
    </PageContainer>
  );
}

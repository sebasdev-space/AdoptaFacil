import { useCallback, useEffect, useState } from 'react';
import { Role, type AdoptionRequest, type AdoptionStatus } from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  cn,
  EmptyState,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import {
  EMPTY_HISTORY_FILTERS,
  HistoryControls,
  PageContainer,
  PageHeader,
  historyQueryString,
  normalizeHistoryPage,
  type HistoryFilters,
} from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import {
  listAdoptionRequests,
  listAdoptionRequestsHistory,
  transitionAdoptionRequest,
} from '../api/adoptions-api';
import { AdoptionContractPanel } from '../components/adoption-contract-panel';
import { ApplicantDetailModal } from '../components/applicant-detail-modal';
import {
  ADOPTION_COLUMNS,
  ADOPTION_NEXT_STATUSES,
  ADOPTION_STATUS_LABELS,
  adoptionStatusVariant,
  formatBogota,
} from '../model/adoptions-view';
import styles from './adoptions-kanban-page.module.scss';

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
  // F-MODAL-SOLICITANTE: se guarda el id, no el objeto — así el modal siempre
  // refleja el estado más reciente de `requests` tras avanzar (p. ej. permite
  // mover new → in_review → approved sin cerrar y reabrir).
  const [detailRequestId, setDetailRequestId] = useState<string | null>(null);
  const detailRequest = requests.find((r) => r.id === detailRequestId) ?? null;

  // Hallazgo del cliente: por defecto solo los últimos 30 días (el API aplica el
  // default); "Ver todo" abre filtros + paginación sobre el historial completo.
  const [showAll, setShowAll] = useState(false);
  const [filters, setFilters] = useState<HistoryFilters>(EMPTY_HISTORY_FILTERS);
  const [total, setTotal] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    const request = showAll
      ? listAdoptionRequestsHistory(client, historyQueryString(filters)).then((body) => {
          const page = normalizeHistoryPage<AdoptionRequest>(body);
          setTotal(page.total);
          return page.items;
        })
      : listAdoptionRequests(client);
    request
      .then(setRequests)
      .catch(() =>
        toast({ title: 'No se pudieron cargar las solicitudes', variant: 'destructive' }),
      )
      .finally(() => setLoading(false));
  }, [client, toast, showAll, filters]);

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
      <HistoryControls
        showAll={showAll}
        onShowAll={() => setShowAll(true)}
        onBackToRecent={() => {
          setShowAll(false);
          setFilters(EMPTY_HISTORY_FILTERS);
        }}
        filters={filters}
        onFiltersChange={setFilters}
        statusOptions={ADOPTION_COLUMNS.map((s) => ({
          value: s,
          label: ADOPTION_STATUS_LABELS[s],
        }))}
        total={total}
      />
      <div className={styles.board}>
        {ADOPTION_COLUMNS.map((column) => {
          const items = requests.filter((r) => r.status === column);
          return (
            <section
              key={column}
              aria-label={ADOPTION_STATUS_LABELS[column]}
              className={styles.column}
            >
              <header className={styles.column__header}>
                <h2 className={styles.column__title}>{ADOPTION_STATUS_LABELS[column]}</h2>
                <Badge variant={adoptionStatusVariant(column)}>{items.length}</Badge>
              </header>

              {loading ? (
                <Skeleton className="h-24 w-full" />
              ) : items.length === 0 ? (
                <p className={styles.column__empty}>Sin solicitudes.</p>
              ) : (
                items.map((request) => (
                  <Card key={request.id} data-testid="adoption-card">
                    <CardContent className="space-y-2 p-3">
                      <div className={styles.card__top}>
                        <span className={styles.card__animal}>{request.animalSnapshot.name}</span>
                        <span className={styles.card__date}>{formatBogota(request.createdAt)}</span>
                      </div>
                      <p className={styles.card__applicant}>{request.applicant.fullName}</p>
                      <p className={cn('line-clamp-3', styles.card__message)}>{request.message}</p>
                      <div className={styles.card__actions}>
                        {/* F-MODAL-SOLICITANTE: paso de detalle antes de decidir — no
                            reemplaza los botones directos de abajo, los complementa. */}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDetailRequestId(request.id)}
                          data-testid="open-applicant-detail"
                        >
                          Ver detalle
                        </Button>
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
                      {/* T-028b · contrato + firma (solo sobre solicitudes aprobadas). */}
                      {request.status === 'approved' && (
                        <AdoptionContractPanel requestId={request.id} canManage={canEvaluate} />
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </section>
          );
        })}
      </div>
      <ApplicantDetailModal
        request={detailRequest}
        onOpenChange={(open) => !open && setDetailRequestId(null)}
        onAdvance={(request, targetStatus) => void move(request, targetStatus)}
        movingId={movingId}
      />
    </PageContainer>
  );
}

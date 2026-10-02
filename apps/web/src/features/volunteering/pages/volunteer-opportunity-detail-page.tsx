import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  type DecideServiceHoursInput,
  type DecideVolunteerEnrollmentInput,
  type Paginated,
  Role,
  type ServiceHours,
  type VolunteerCertificate,
  type VolunteerEnrollment,
  type VolunteerOpportunity,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import {
  ENROLLMENT_STATUS_LABELS,
  HOURS_STATUS_LABELS,
  enrollmentStatusVariant,
  formatBogota,
  formatHours,
  hoursStatusVariant,
} from '../model/volunteering-view';

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

/**
 * `/organizacion/voluntariado/:id` (RF18/RF19, M08) - detalle interno de una
 * oportunidad: gestionar la cola de inscripciones (aceptar/rechazar), las
 * horas de cada voluntario aceptado (aprobar/rechazar), y emitir el
 * certificado. Owner/Administrator gestionan; ver = + ReadOnlyAuditor.
 */
export function VolunteerOpportunityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const client = useApiClient();
  const { hasRole } = useSession();
  const canManage = hasRole(Role.Owner) || hasRole(Role.Administrator);
  const { toast } = useToast();

  const [state, setState] = useState<LoadState>('loading');
  const [opportunity, setOpportunity] = useState<VolunteerOpportunity | null>(null);
  const [enrollments, setEnrollments] = useState<VolunteerEnrollment[]>([]);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hours, setHours] = useState<ServiceHours[]>([]);
  const [hoursLoading, setHoursLoading] = useState(false);
  const [rejectingHoursId, setRejectingHoursId] = useState<string | null>(null);
  const [rejectHoursReason, setRejectHoursReason] = useState('');
  const [certificates, setCertificates] = useState<Record<string, VolunteerCertificate>>({});

  const loadEnrollments = async (): Promise<void> => {
    if (!id) return;
    const page = await client.request<Partial<Paginated<VolunteerEnrollment>>>(
      `/volunteer-enrollments?opportunityId=${encodeURIComponent(id)}&limit=100`,
    );
    setEnrollments(Array.isArray(page?.items) ? page.items : []);
  };

  useEffect(() => {
    if (!id) {
      setState('not-found');
      return;
    }
    let active = true;
    void (async () => {
      try {
        const found = await client.request<VolunteerOpportunity>(
          `/volunteer-opportunities/${encodeURIComponent(id)}`,
        );
        if (active) {
          setOpportunity(found);
          setState('ready');
        }
      } catch {
        if (active) setState('error');
      }
    })();
    void loadEnrollments();
    return () => {
      active = false;
    };
  }, [client, id]);

  const decideEnrollment = async (
    enrollmentId: string,
    dto: DecideVolunteerEnrollmentInput,
  ): Promise<void> => {
    try {
      await client.request(`/volunteer-enrollments/${encodeURIComponent(enrollmentId)}/decision`, {
        method: 'POST',
        json: dto,
      });
      setRejectingId(null);
      setRejectReason('');
      await loadEnrollments();
      toast({
        title: dto.decision === 'accept' ? 'Inscripción aceptada' : 'Inscripción rechazada',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'No se pudo registrar la decisión',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  const toggleHours = async (enrollmentId: string): Promise<void> => {
    if (expandedId === enrollmentId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(enrollmentId);
    setHoursLoading(true);
    try {
      const page = await client.request<Partial<Paginated<ServiceHours>>>(
        `/service-hours?enrollmentId=${encodeURIComponent(enrollmentId)}&limit=100`,
      );
      setHours(Array.isArray(page?.items) ? page.items : []);
    } finally {
      setHoursLoading(false);
    }
  };

  const decideHours = async (
    hoursId: string,
    enrollmentId: string,
    dto: DecideServiceHoursInput,
  ): Promise<void> => {
    try {
      await client.request(`/service-hours/${encodeURIComponent(hoursId)}/decision`, {
        method: 'POST',
        json: dto,
      });
      setRejectingHoursId(null);
      setRejectHoursReason('');
      await toggleHoursRefresh(enrollmentId);
      toast({
        title: dto.decision === 'approve' ? 'Horas aprobadas' : 'Horas rechazadas',
        variant: 'success',
      });
    } catch (error) {
      toast({
        title: 'No se pudo registrar la decisión',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  const toggleHoursRefresh = async (enrollmentId: string): Promise<void> => {
    const page = await client.request<Partial<Paginated<ServiceHours>>>(
      `/service-hours?enrollmentId=${encodeURIComponent(enrollmentId)}&limit=100`,
    );
    setHours(Array.isArray(page?.items) ? page.items : []);
  };

  const issueCertificate = async (enrollmentId: string): Promise<void> => {
    try {
      const certificate = await client.request<VolunteerCertificate>(
        `/volunteer-certificates/${encodeURIComponent(enrollmentId)}`,
        { method: 'POST' },
      );
      setCertificates((prev) => ({ ...prev, [enrollmentId]: certificate }));
      toast({ title: 'Certificado emitido', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudo emitir el certificado',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  // Stats derivadas de inscripciones
  const pendingCount = enrollments.filter((e) => e.status === 'pending').length;
  const acceptedCount = enrollments.filter((e) => e.status === 'accepted').length;

  return (
    <PageContainer>
      <div className="mb-2">
        <Link
          to="/organizacion/voluntariado"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <span aria-hidden>←</span> Volver a voluntariado
        </Link>
      </div>

      <PageHeader
        title="Detalle de oportunidad"
        description="Gestiona inscripciones, horas y certificados de esta oportunidad."
      />

      {state === 'loading' && (
        <div className="space-y-4">
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      )}

      {state === 'not-found' && (
        <EmptyState title="Oportunidad no especificada" description="Falta el identificador." />
      )}

      {state === 'error' && (
        <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
      )}

      {state === 'ready' && opportunity && (
        <div className="space-y-6">
          {/* Card de detalles de la oportunidad */}
          <Card className="relative overflow-hidden border-primary/20">
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 h-1 rounded-t-[inherit] bg-primary"
            />
            <CardHeader className="pt-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <CardTitle className="text-xl leading-tight">{opportunity.title}</CardTitle>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">{opportunity.category}</Badge>
                  {opportunity.appliesToStudentService && (
                    <Badge variant="info">🎓 Serv. social</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden>📅</span>
                  {formatBogota(opportunity.startDate)} – {formatBogota(opportunity.endDate)}
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden>📍</span>
                  {opportunity.location}
                </span>
                {opportunity.requirements && (
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden>📋</span>
                    {opportunity.requirements}
                  </span>
                )}
              </div>

              {/* Mini stats de inscripciones */}
              {enrollments.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-3 border-t pt-4">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
                    {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
                    {acceptedCount} aceptada{acceptedCount !== 1 ? 's' : ''}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                    {enrollments.length} total
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cola de inscripciones */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <span aria-hidden className="text-lg">
                  👥
                </span>
                Inscripciones
                {pendingCount > 0 && (
                  <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warning text-xs font-bold text-warning-foreground">
                    {pendingCount}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {enrollments.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg bg-muted/30 py-8 text-center">
                  <p className="text-sm font-medium text-foreground">Aún no hay inscripciones</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Cuando alguien se inscriba aparecerán aquí.
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {enrollments.map((enrollment) => (
                    <li
                      key={enrollment.id}
                      className="rounded-lg border bg-card p-4 transition-shadow hover:shadow-sm"
                    >
                      {/* Cabecera del voluntario */}
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-foreground">{enrollment.volunteerName}</p>
                          <p className="text-xs text-muted-foreground">
                            {enrollment.volunteerEmail}
                          </p>
                        </div>
                        <Badge variant={enrollmentStatusVariant(enrollment.status)}>
                          {ENROLLMENT_STATUS_LABELS[enrollment.status]}
                        </Badge>
                      </div>

                      {/* Acciones para inscripciones pendientes */}
                      {canManage && enrollment.status === 'pending' && (
                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                          <Button
                            size="sm"
                            onClick={() =>
                              void decideEnrollment(enrollment.id, { decision: 'accept' })
                            }
                          >
                            <span aria-hidden className="mr-1">
                              ✓
                            </span>{' '}
                            Aceptar
                          </Button>
                          {rejectingId === enrollment.id ? (
                            <>
                              <Input
                                placeholder="Motivo del rechazo (opcional)"
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                className="h-9 flex-1 min-w-40"
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  void decideEnrollment(enrollment.id, {
                                    decision: 'reject',
                                    reason: rejectReason,
                                  })
                                }
                              >
                                Confirmar rechazo
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setRejectingId(null);
                                  setRejectReason('');
                                }}
                              >
                                Cancelar
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setRejectingId(enrollment.id)}
                            >
                              Rechazar
                            </Button>
                          )}
                        </div>
                      )}

                      {/* Motivo de rechazo */}
                      {enrollment.status === 'rejected' && enrollment.rejectionReason && (
                        <div className="mt-3 rounded-md bg-destructive/5 border border-destructive/20 px-3 py-2">
                          <p className="text-xs text-destructive">
                            <span className="font-medium">Motivo:</span>{' '}
                            {enrollment.rejectionReason}
                          </p>
                        </div>
                      )}

                      {/* Panel de horas para inscripciones aceptadas/completadas */}
                      {(enrollment.status === 'accepted' || enrollment.status === 'completed') && (
                        <div className="mt-3 space-y-3 border-t pt-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void toggleHours(enrollment.id)}
                            >
                              {expandedId === enrollment.id ? (
                                <>
                                  <span aria-hidden>▲</span> Ocultar horas
                                </>
                              ) : (
                                <>
                                  <span aria-hidden>▼</span> Ver horas
                                </>
                              )}
                            </Button>

                            {canManage &&
                              (certificates[enrollment.id] ? (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success">
                                  <span aria-hidden>🏅</span>
                                  Certificado emitido ·{' '}
                                  {certificates[enrollment.id].totalApprovedHours} h
                                </span>
                              ) : (
                                <Button
                                  size="sm"
                                  onClick={() => void issueCertificate(enrollment.id)}
                                >
                                  <span aria-hidden className="mr-1">
                                    🏅
                                  </span>
                                  Emitir certificado
                                </Button>
                              ))}
                          </div>

                          {expandedId === enrollment.id && (
                            <div className="rounded-lg bg-muted/30 p-3">
                              {hoursLoading && <Skeleton className="h-16 w-full" />}
                              {!hoursLoading && hours.length === 0 && (
                                <p className="text-center text-xs text-muted-foreground py-3">
                                  Aún no hay horas registradas por este voluntario.
                                </p>
                              )}
                              {!hoursLoading && hours.length > 0 && (
                                <ul className="space-y-2">
                                  {hours.map((entry) => (
                                    <li
                                      key={entry.id}
                                      className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-card p-3 text-sm shadow-sm"
                                    >
                                      <div className="min-w-0">
                                        <p className="font-medium text-foreground">
                                          {formatBogota(entry.date)} · {formatHours(entry.hours)}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          {entry.description}
                                        </p>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant={hoursStatusVariant(entry.status)}>
                                          {HOURS_STATUS_LABELS[entry.status]}
                                        </Badge>
                                        {canManage && entry.status === 'pending' && (
                                          <>
                                            <Button
                                              size="sm"
                                              onClick={() =>
                                                void decideHours(entry.id, enrollment.id, {
                                                  decision: 'approve',
                                                })
                                              }
                                            >
                                              <span aria-hidden>✓</span> Aprobar
                                            </Button>
                                            {rejectingHoursId === entry.id ? (
                                              <>
                                                <Input
                                                  placeholder="Motivo"
                                                  value={rejectHoursReason}
                                                  onChange={(e) =>
                                                    setRejectHoursReason(e.target.value)
                                                  }
                                                  className="h-9 w-36"
                                                />
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  onClick={() =>
                                                    void decideHours(entry.id, enrollment.id, {
                                                      decision: 'reject',
                                                      reason: rejectHoursReason,
                                                    })
                                                  }
                                                >
                                                  Confirmar
                                                </Button>
                                                <Button
                                                  size="sm"
                                                  variant="outline"
                                                  onClick={() => {
                                                    setRejectingHoursId(null);
                                                    setRejectHoursReason('');
                                                  }}
                                                >
                                                  Cancelar
                                                </Button>
                                              </>
                                            ) : (
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setRejectingHoursId(entry.id)}
                                              >
                                                Rechazar
                                              </Button>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}

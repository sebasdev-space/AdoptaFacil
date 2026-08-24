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
 * `/organizacion/voluntariado/:id` (RF18/RF19, M08) — detalle interno de una
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

  return (
    <PageContainer>
      <PageHeader
        title="Detalle de oportunidad"
        description="Gestiona inscripciones, horas y certificados de esta oportunidad de voluntariado."
      />
      <Link
        to="/organizacion/voluntariado"
        className="mb-4 inline-block text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Volver a voluntariado
      </Link>

      {state === 'loading' && <Skeleton className="h-64 w-full" />}
      {state === 'not-found' && (
        <EmptyState title="Oportunidad no especificada" description="Falta el identificador." />
      )}
      {state === 'error' && (
        <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
      )}

      {state === 'ready' && opportunity && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {opportunity.title}
                <Badge variant="secondary">{opportunity.category}</Badge>
                {opportunity.appliesToStudentService && (
                  <Badge variant="info">Servicio social estudiantil</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>
                {formatBogota(opportunity.startDate)} – {formatBogota(opportunity.endDate)}
              </p>
              <p>{opportunity.location}</p>
              {opportunity.requirements && <p>Requisitos: {opportunity.requirements}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Inscripciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {enrollments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no hay inscripciones.</p>
              ) : (
                <ul className="space-y-3">
                  {enrollments.map((enrollment) => (
                    <li key={enrollment.id} className="space-y-3 rounded-md border p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium">{enrollment.volunteerName}</p>
                          <p className="text-xs text-muted-foreground">
                            {enrollment.volunteerEmail}
                          </p>
                        </div>
                        <Badge variant={enrollmentStatusVariant(enrollment.status)}>
                          {ENROLLMENT_STATUS_LABELS[enrollment.status]}
                        </Badge>
                      </div>

                      {canManage && enrollment.status === 'pending' && (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() =>
                              void decideEnrollment(enrollment.id, { decision: 'accept' })
                            }
                          >
                            Aceptar
                          </Button>
                          {rejectingId === enrollment.id ? (
                            <>
                              <Input
                                placeholder="Motivo del rechazo"
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                className="h-9 w-56"
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

                      {(enrollment.status === 'accepted' || enrollment.status === 'completed') && (
                        <div className="space-y-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void toggleHours(enrollment.id)}
                          >
                            {expandedId === enrollment.id ? 'Ocultar horas' : 'Ver horas'}
                          </Button>

                          {expandedId === enrollment.id && (
                            <div className="space-y-2 rounded-md border p-3">
                              {hoursLoading && <Skeleton className="h-16 w-full" />}
                              {!hoursLoading && hours.length === 0 && (
                                <p className="text-xs text-muted-foreground">
                                  Aún no hay horas registradas.
                                </p>
                              )}
                              {!hoursLoading &&
                                hours.map((entry) => (
                                  <div
                                    key={entry.id}
                                    className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0"
                                  >
                                    <div>
                                      <p>
                                        {formatBogota(entry.date)} · {formatHours(entry.hours)}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {entry.description}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2">
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
                                            Aprobar
                                          </Button>
                                          {rejectingHoursId === entry.id ? (
                                            <>
                                              <Input
                                                placeholder="Motivo"
                                                value={rejectHoursReason}
                                                onChange={(e) =>
                                                  setRejectHoursReason(e.target.value)
                                                }
                                                className="h-9 w-40"
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
                                  </div>
                                ))}
                            </div>
                          )}

                          {canManage &&
                            (certificates[enrollment.id] ? (
                              <p className="text-xs text-muted-foreground">
                                Certificado emitido:{' '}
                                {certificates[enrollment.id].totalApprovedHours} horas efectivas.
                              </p>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => void issueCertificate(enrollment.id)}
                              >
                                Emitir certificado
                              </Button>
                            ))}
                        </div>
                      )}

                      {enrollment.status === 'rejected' && enrollment.rejectionReason && (
                        <p className="text-xs text-muted-foreground">
                          Motivo: {enrollment.rejectionReason}
                        </p>
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

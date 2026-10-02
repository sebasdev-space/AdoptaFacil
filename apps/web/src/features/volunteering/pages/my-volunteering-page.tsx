import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  type Paginated,
  type ServiceHours,
  type VolunteerCertificate,
  type VolunteerEnrollmentMine,
  type VolunteerOpportunityPublic,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { isIncompleteProfileError, useApiClient } from '../../../shell/api';
import { StudentServiceEnrollmentModal } from '../components/student-service-enrollment-modal';
import { downloadVolunteerCertificatePdf } from '../lib/certificate';
import {
  ENROLLMENT_STATUS_LABELS,
  HOURS_STATUS_LABELS,
  enrollmentStatusVariant,
  formatBogota,
  formatHours,
  hoursStatusVariant,
  parseSessionHours,
} from '../model/volunteering-view';

/**
 * `/voluntariado` (RF18/RF19, M08) - experiencia del voluntario (Persona):
 * explorar oportunidades públicas e inscribirse, ver "mis inscripciones",
 * registrar horas contra una inscripción aceptada, ver "mis horas" y
 * descargar mis certificados. Cualquier Persona autenticada.
 */
export function MyVolunteeringPage() {
  const client = useApiClient();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [opportunities, setOpportunities] = useState<VolunteerOpportunityPublic[]>([]);
  const [enrollments, setEnrollments] = useState<VolunteerEnrollmentMine[]>([]);
  const [hours, setHours] = useState<ServiceHours[]>([]);
  const [certificates, setCertificates] = useState<VolunteerCertificate[]>([]);
  const [loading, setLoading] = useState(true);

  const [studentServiceTarget, setStudentServiceTarget] =
    useState<VolunteerOpportunityPublic | null>(null);

  const [logForEnrollmentId, setLogForEnrollmentId] = useState<string | null>(null);
  const [logDate, setLogDate] = useState('');
  const [logHoursValue, setLogHoursValue] = useState('');
  const [logDescription, setLogDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const loadAll = async (): Promise<void> => {
    const [opportunitiesPage, enrollmentsList, hoursList, certificatesList] = await Promise.all([
      client.request<Partial<Paginated<VolunteerOpportunityPublic>>>(
        '/public/volunteer-opportunities?limit=50',
      ),
      client.request<VolunteerEnrollmentMine[]>('/volunteer-enrollments/mine'),
      client.request<ServiceHours[]>('/service-hours/mine'),
      client.request<VolunteerCertificate[]>('/volunteer-certificates/mine'),
    ]);
    setOpportunities(Array.isArray(opportunitiesPage?.items) ? opportunitiesPage.items : []);
    setEnrollments(Array.isArray(enrollmentsList) ? enrollmentsList : []);
    setHours(Array.isArray(hoursList) ? hoursList : []);
    setCertificates(Array.isArray(certificatesList) ? certificatesList : []);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await loadAll();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client]);

  const enroll = async (opportunityId: string): Promise<void> => {
    try {
      await client.request('/volunteer-enrollments', { method: 'POST', json: { opportunityId } });
      await loadAll();
      toast({ title: 'Inscripción enviada', variant: 'success' });
    } catch (error) {
      if (isIncompleteProfileError(error)) {
        navigate('/perfil/completar', {
          state: {
            reason:
              'Antes de inscribirte como voluntario necesitamos tu teléfono, documento de identidad y dirección.',
          },
        });
        return;
      }
      toast({
        title: 'No se pudo completar la inscripción',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    }
  };

  const resetLogForm = (): void => {
    setLogForEnrollmentId(null);
    setLogDate('');
    setLogHoursValue('');
    setLogDescription('');
  };

  const submitHours = async (enrollmentId: string): Promise<void> => {
    const parsedHours = parseSessionHours(logHoursValue);
    if (!logDate || parsedHours === null || !logDescription.trim()) {
      toast({
        title: 'Datos incompletos',
        description: 'Fecha, horas (hasta 24) y descripción son obligatorios.',
        variant: 'warning',
      });
      return;
    }
    setSaving(true);
    try {
      await client.request('/service-hours', {
        method: 'POST',
        json: {
          enrollmentId,
          date: new Date(logDate).toISOString(),
          hours: parsedHours,
          description: logDescription.trim(),
        },
      });
      resetLogForm();
      await loadAll();
      toast({ title: 'Horas registradas', variant: 'success' });
    } catch (error) {
      toast({
        title: 'No se pudieron registrar las horas',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const enrolledOpportunityIds = new Set(enrollments.map((e) => e.opportunityId));
  const totalApprovedHours = hours
    .filter((h) => h.status === 'approved')
    .reduce((acc, h) => acc + h.hours, 0);

  return (
    <PageContainer>
      <PageHeader
        title="Mi voluntariado"
        description="Explora oportunidades, inscríbete, registra tus horas y descarga tus certificados."
      />

      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!loading && (
        <div className="space-y-6">
          {/* Banner de resumen si ya hay actividad */}
          {(enrollments.length > 0 || hours.length > 0) && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border bg-primary/5 p-4 text-center">
                <p className="text-2xl font-bold text-primary">{enrollments.length}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Inscripciones</p>
              </div>
              <div className="rounded-xl border bg-success/5 p-4 text-center">
                <p className="text-2xl font-bold text-success">{formatHours(totalApprovedHours)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Horas aprobadas</p>
              </div>
              <div className="rounded-xl border bg-warning/5 p-4 text-center">
                <p className="text-2xl font-bold text-warning">
                  {hours.filter((h) => h.status === 'pending').length}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">Horas pendientes</p>
              </div>
              <div className="rounded-xl border bg-muted p-4 text-center">
                <p className="text-2xl font-bold text-foreground">{certificates.length}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Certificados</p>
              </div>
            </div>
          )}

          {/* Oportunidades disponibles */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <span aria-hidden className="text-lg">
                  🔍
                </span>
                Oportunidades disponibles
              </CardTitle>
            </CardHeader>
            <CardContent>
              {opportunities.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg bg-muted/30 py-8 text-center">
                  <p className="text-sm font-medium text-foreground">
                    No hay oportunidades activas por ahora
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Vuelve pronto, las organizaciones publicarán nuevas actividades.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {opportunities.map((opportunity) => {
                    const enrolled = enrolledOpportunityIds.has(opportunity.id);
                    return (
                      <li
                        key={opportunity.id}
                        className="group flex flex-col gap-3 rounded-lg border bg-card p-4 transition-all sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium leading-snug text-foreground">
                              {opportunity.title}
                            </p>
                            {opportunity.appliesToStudentService && (
                              <span className="inline-flex items-center rounded-full bg-info/10 px-2 py-0.5 text-xs font-medium text-info">
                                🎓 Serv. social
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {opportunity.organizationName}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            <span>
                              📅 {formatBogota(opportunity.startDate)} –{' '}
                              {formatBogota(opportunity.endDate)}
                            </span>
                            <span>📍 {opportunity.location}</span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant={enrolled ? 'outline' : 'default'}
                          disabled={enrolled}
                          className="shrink-0 sm:w-auto w-full"
                          onClick={() =>
                            opportunity.appliesToStudentService
                              ? setStudentServiceTarget(opportunity)
                              : void enroll(opportunity.id)
                          }
                        >
                          {enrolled ? (
                            <span className="flex items-center gap-1.5">
                              <span aria-hidden>✓</span> Ya inscrito
                            </span>
                          ) : (
                            'Inscribirme'
                          )}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Mis inscripciones */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <span aria-hidden className="text-lg">
                  📋
                </span>
                Mis inscripciones
              </CardTitle>
            </CardHeader>
            <CardContent>
              {enrollments.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Aún no tienes inscripciones. Explora las oportunidades disponibles arriba.
                </p>
              ) : (
                <ul className="space-y-3">
                  {enrollments.map((enrollment) => (
                    <li key={enrollment.id} className="rounded-lg border bg-card p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium leading-snug text-foreground">
                            {enrollment.opportunityTitle}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {enrollment.organizationName}
                          </p>
                        </div>
                        <Badge
                          variant={enrollmentStatusVariant(enrollment.status)}
                          className="shrink-0"
                        >
                          {ENROLLMENT_STATUS_LABELS[enrollment.status]}
                        </Badge>
                      </div>

                      {enrollment.status === 'rejected' && enrollment.rejectionReason && (
                        <div className="mt-3 rounded-md bg-destructive/5 border border-destructive/20 px-3 py-2">
                          <p className="text-xs text-destructive">
                            <span className="font-medium">Motivo del rechazo:</span>{' '}
                            {enrollment.rejectionReason}
                          </p>
                        </div>
                      )}

                      {(enrollment.status === 'accepted' || enrollment.status === 'completed') && (
                        <div className="mt-3 space-y-3">
                          {logForEnrollmentId === enrollment.id ? (
                            <div className="rounded-lg bg-muted/40 p-3">
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Registrar sesión de horas
                              </p>
                              <div className="grid gap-2 sm:grid-cols-3">
                                <Input
                                  type="date"
                                  value={logDate}
                                  onChange={(e) => setLogDate(e.target.value)}
                                  aria-label="Fecha de la sesión"
                                />
                                <Input
                                  type="number"
                                  min={0.5}
                                  max={24}
                                  step={0.5}
                                  placeholder="Horas (máx 24)"
                                  value={logHoursValue}
                                  onChange={(e) => setLogHoursValue(e.target.value)}
                                  aria-label="Horas trabajadas"
                                />
                                <Input
                                  placeholder="Descripción de la sesión"
                                  value={logDescription}
                                  onChange={(e) => setLogDescription(e.target.value)}
                                  aria-label="Descripción de la sesión"
                                />
                              </div>
                              <div className="mt-2 flex gap-2 sm:col-span-3">
                                <Button
                                  size="sm"
                                  disabled={saving}
                                  onClick={() => void submitHours(enrollment.id)}
                                >
                                  {saving ? 'Guardando...' : 'Guardar horas'}
                                </Button>
                                <Button size="sm" variant="outline" onClick={resetLogForm}>
                                  Cancelar
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setLogForEnrollmentId(enrollment.id)}
                            >
                              <span aria-hidden className="mr-1.5">
                                +
                              </span>
                              Registrar horas
                            </Button>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Mis horas */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <span aria-hidden className="text-lg">
                  ⏱️
                </span>
                Mis horas registradas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {hours.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Aún no has registrado horas. Acepta una inscripción y registra tu primera sesión.
                </p>
              ) : (
                <ul className="divide-y">
                  {hours.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm first:pt-0 last:pb-0"
                    >
                      <div>
                        <p className="font-medium text-foreground">
                          {formatBogota(entry.date)} · {formatHours(entry.hours)}
                        </p>
                        <p className="text-xs text-muted-foreground">{entry.description}</p>
                      </div>
                      <Badge variant={hoursStatusVariant(entry.status)}>
                        {HOURS_STATUS_LABELS[entry.status]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Mis certificados */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <span aria-hidden className="text-lg">
                  🏅
                </span>
                Mis certificados
              </CardTitle>
            </CardHeader>
            <CardContent>
              {certificates.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Aún no tienes certificados emitidos. Completa una actividad para obtenerlos.
                </p>
              ) : (
                <ul className="space-y-3">
                  {certificates.map((certificate) => (
                    <li
                      key={certificate.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4"
                    >
                      <div className="min-w-0">
                        <p className="font-medium leading-snug text-foreground">
                          {certificate.opportunityTitle}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {certificate.organizationName}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span>⏱️ {certificate.totalApprovedHours} horas efectivas</span>
                          <span>📅 Emitido {formatBogota(certificate.issuedAt)}</span>
                        </div>
                        {certificate.schoolName && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            🎓 {certificate.schoolName}
                            {certificate.schoolAgreementCode &&
                              ` · Convenio ${certificate.schoolAgreementCode}`}
                          </p>
                        )}
                        {certificate.guardianName && (
                          <p className="text-xs text-muted-foreground">
                            Acudiente: {certificate.guardianName}
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => void downloadVolunteerCertificatePdf(client, certificate.id)}
                      >
                        <span aria-hidden className="mr-1.5">
                          ⬇
                        </span>
                        Descargar PDF
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {studentServiceTarget && (
        <StudentServiceEnrollmentModal
          open={studentServiceTarget !== null}
          onOpenChange={(next) => !next && setStudentServiceTarget(null)}
          opportunityId={studentServiceTarget.id}
          opportunityTitle={studentServiceTarget.title}
          onEnrolled={() => void loadAll()}
          onIncompleteProfile={() =>
            navigate('/perfil/completar', {
              state: {
                reason:
                  'Antes de inscribirte como voluntario necesitamos tu teléfono, documento de identidad y dirección.',
              },
            })
          }
        />
      )}
    </PageContainer>
  );
}

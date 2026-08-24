import { useEffect, useState } from 'react';
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
  EmptyState,
  Input,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
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
 * `/voluntariado` (RF18/RF19, M08) — experiencia del voluntario (Persona):
 * explorar oportunidades públicas e inscribirse, ver "mis inscripciones",
 * registrar horas contra una inscripción aceptada, ver "mis horas" y
 * descargar mis certificados. Cualquier Persona autenticada — sin rol de
 * organización.
 */
export function MyVolunteeringPage() {
  const client = useApiClient();
  const { toast } = useToast();

  const [opportunities, setOpportunities] = useState<VolunteerOpportunityPublic[]>([]);
  const [enrollments, setEnrollments] = useState<VolunteerEnrollmentMine[]>([]);
  const [hours, setHours] = useState<ServiceHours[]>([]);
  const [certificates, setCertificates] = useState<VolunteerCertificate[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <PageContainer>
      <PageHeader
        title="Voluntariado"
        description="Explora oportunidades, inscríbete, registra tus horas y descarga tus certificados."
      />
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Oportunidades disponibles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {opportunities.length === 0 ? (
                <EmptyState title="No hay oportunidades activas por ahora." />
              ) : (
                <ul className="space-y-3">
                  {opportunities.map((opportunity) => (
                    <li
                      key={opportunity.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                    >
                      <div>
                        <p className="font-medium">
                          {opportunity.title} · {opportunity.organizationName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatBogota(opportunity.startDate)} –{' '}
                          {formatBogota(opportunity.endDate)} · {opportunity.location}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        disabled={enrolledOpportunityIds.has(opportunity.id)}
                        onClick={() => void enroll(opportunity.id)}
                      >
                        {enrolledOpportunityIds.has(opportunity.id) ? 'Ya inscrito' : 'Inscribirme'}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mis inscripciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {enrollments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no tienes inscripciones.</p>
              ) : (
                <ul className="space-y-3">
                  {enrollments.map((enrollment) => (
                    <li key={enrollment.id} className="space-y-2 rounded-md border p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">
                          {enrollment.opportunityTitle} · {enrollment.organizationName}
                        </p>
                        <Badge variant={enrollmentStatusVariant(enrollment.status)}>
                          {ENROLLMENT_STATUS_LABELS[enrollment.status]}
                        </Badge>
                      </div>
                      {enrollment.status === 'rejected' && enrollment.rejectionReason && (
                        <p className="text-xs text-muted-foreground">
                          Motivo: {enrollment.rejectionReason}
                        </p>
                      )}
                      {(enrollment.status === 'accepted' || enrollment.status === 'completed') && (
                        <div className="space-y-2">
                          {logForEnrollmentId === enrollment.id ? (
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
                                placeholder="Horas"
                                value={logHoursValue}
                                onChange={(e) => setLogHoursValue(e.target.value)}
                                aria-label="Horas trabajadas"
                              />
                              <Input
                                placeholder="Descripción"
                                value={logDescription}
                                onChange={(e) => setLogDescription(e.target.value)}
                                aria-label="Descripción de la sesión"
                              />
                              <div className="flex gap-2 sm:col-span-3">
                                <Button
                                  size="sm"
                                  disabled={saving}
                                  onClick={() => void submitHours(enrollment.id)}
                                >
                                  {saving ? 'Guardando…' : 'Guardar horas'}
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

          <Card>
            <CardHeader>
              <CardTitle>Mis horas</CardTitle>
            </CardHeader>
            <CardContent>
              {hours.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no has registrado horas.</p>
              ) : (
                <ul className="space-y-2">
                  {hours.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                    >
                      <div>
                        <p>
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

          <Card>
            <CardHeader>
              <CardTitle>Mis certificados</CardTitle>
            </CardHeader>
            <CardContent>
              {certificates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aún no tienes certificados emitidos.
                </p>
              ) : (
                <ul className="space-y-2">
                  {certificates.map((certificate) => (
                    <li
                      key={certificate.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                    >
                      <div>
                        <p className="font-medium">
                          {certificate.opportunityTitle} · {certificate.organizationName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {certificate.totalApprovedHours} horas efectivas · emitido{' '}
                          {formatBogota(certificate.issuedAt)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void downloadVolunteerCertificatePdf(client, certificate.id)}
                      >
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
    </PageContainer>
  );
}

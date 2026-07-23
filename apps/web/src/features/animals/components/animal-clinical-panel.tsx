import { useEffect, useState } from 'react';
import {
  type ClinicalEvent,
  ClinicalEventType,
  type CreateClinicalEventInput,
  Role,
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
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';

const TYPE_LABELS: Record<ClinicalEventType, string> = {
  [ClinicalEventType.Vaccine]: 'Vacuna',
  [ClinicalEventType.Treatment]: 'Tratamiento',
  [ClinicalEventType.Surgery]: 'Cirugía',
  [ClinicalEventType.Sterilization]: 'Esterilización',
  [ClinicalEventType.Allergy]: 'Alergia',
  [ClinicalEventType.Disability]: 'Incapacidad',
  [ClinicalEventType.Medication]: 'Medicamento',
  [ClinicalEventType.Diagnosis]: 'Diagnóstico',
};

function formatCO(iso?: string): string {
  return iso ? new Date(iso).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' }) : '—';
}

export interface AnimalClinicalPanelProps {
  animalId: string;
}

/** Expediente clínico de un animal (RF08). Ver: roles que gestionan/ven el animal;
 *  registrar/editar: SOLO Veterinarian. El editar crea una nueva versión. */
export function AnimalClinicalPanel({ animalId }: AnimalClinicalPanelProps) {
  const client = useApiClient();
  const { hasRole } = useSession();
  const canEdit = hasRole(Role.Veterinarian);
  const { toast } = useToast();

  const [events, setEvents] = useState<ClinicalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<ClinicalEventType>(ClinicalEventType.Vaccine);
  const [occurredAt, setOccurredAt] = useState('');
  const [nextDueDate, setNextDueDate] = useState('');
  const [attachment, setAttachment] = useState('');
  const [saving, setSaving] = useState(false);

  const base = `/animals/${animalId}/clinical-events`;

  const load = async (): Promise<void> => {
    const list = await client.request<ClinicalEvent[]>(base);
    setEvents(list);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const list = await client.request<ClinicalEvent[]>(base);
        if (active) setEvents(list);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client, base]);

  const submit = async (): Promise<void> => {
    if (!occurredAt) {
      toast({
        title: 'Fecha requerida',
        description: 'Indica la fecha del evento.',
        variant: 'warning',
      });
      return;
    }
    setSaving(true);
    try {
      const body: CreateClinicalEventInput = {
        type,
        occurredAt: new Date(occurredAt).toISOString(),
        ...(nextDueDate ? { nextDueDate: new Date(nextDueDate).toISOString() } : {}),
        ...(attachment.trim() ? { attachments: [{ filename: attachment.trim() }] } : {}),
      };
      await client.request<ClinicalEvent>(base, { method: 'POST', json: body });
      setOccurredAt('');
      setNextDueDate('');
      setAttachment('');
      await load();
      toast({ title: 'Evento clínico registrado' });
    } catch (error) {
      toast({
        title: 'No se pudo registrar el evento',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>Registrar evento clínico</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <select
              aria-label="Tipo de evento"
              value={type}
              onChange={(e) => setType(e.target.value as ClinicalEventType)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {Object.values(ClinicalEventType).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <Input
              type="date"
              aria-label="Fecha del evento"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
            <Input
              type="date"
              aria-label="Próxima fecha (p. ej. próxima vacuna)"
              value={nextDueDate}
              onChange={(e) => setNextDueDate(e.target.value)}
            />
            <Input
              placeholder="Adjunto (nombre de archivo)"
              value={attachment}
              onChange={(e) => setAttachment(e.target.value)}
            />
            <Button disabled={saving} onClick={() => void submit()}>
              Registrar
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Expediente clínico</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin eventos clínicos.</p>
          ) : (
            <ul className="space-y-3">
              {events.map((event) => (
                <li key={event.id} className="border-b pb-2 text-sm last:border-b-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{TYPE_LABELS[event.type]}</span>
                    <Badge variant="secondary">v{event.version}</Badge>
                    <span className="text-muted-foreground">{formatCO(event.occurredAt)}</span>
                    {event.nextDueDate && <Badge>Próxima: {formatCO(event.nextDueDate)}</Badge>}
                    {event.attachments.length > 0 && (
                      <span className="text-muted-foreground">📎 {event.attachments.length}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

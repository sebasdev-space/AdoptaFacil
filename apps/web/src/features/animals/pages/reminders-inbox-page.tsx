import { useEffect, useState } from 'react';
import {
  type ClinicalReminder,
  ReminderStatus,
  type ReminderType,
  Role,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';

const TYPE_LABELS: Record<string, string> = {
  vaccine: 'Vacuna',
  treatment: 'Tratamiento',
  surgery: 'Cirugía',
  sterilization: 'Esterilización',
  allergy: 'Alergia',
  disability: 'Incapacidad',
  medication: 'Medicamento',
  diagnosis: 'Diagnóstico',
};

const STATUS_LABELS: Record<ReminderStatus, string> = {
  [ReminderStatus.Pending]: 'Pendiente',
  [ReminderStatus.Sent]: 'Enviado',
  [ReminderStatus.Failed]: 'Fallo de envío',
  [ReminderStatus.Acknowledged]: 'Atendido',
  [ReminderStatus.Dismissed]: 'Descartado',
};

function statusVariant(status: ReminderStatus): 'default' | 'secondary' | 'destructive' {
  if (status === ReminderStatus.Failed) return 'destructive';
  if (status === ReminderStatus.Acknowledged || status === ReminderStatus.Dismissed)
    return 'secondary';
  return 'default';
}

function formatCO(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });
}

/** `/recordatorios` — bandeja in-app de recordatorios clínicos (RF09). Ver:
 *  roles del animal + auditor; atender/descartar: sin el auditor. */
export function RemindersInboxPage() {
  const client = useApiClient();
  const { hasRole } = useSession();
  const canResolve =
    hasRole(Role.Owner) ||
    hasRole(Role.Administrator) ||
    hasRole(Role.Operator) ||
    hasRole(Role.Veterinarian);
  const { toast } = useToast();

  const [reminders, setReminders] = useState<ClinicalReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    const list = await client.request<ClinicalReminder[]>('/clinical-reminders');
    setReminders(list);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const list = await client.request<ClinicalReminder[]>('/clinical-reminders');
        if (active) setReminders(list);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client]);

  const resolve = async (id: string, action: 'acknowledge' | 'dismiss'): Promise<void> => {
    setBusy(id);
    try {
      await client.request<ClinicalReminder>(`/clinical-reminders/${id}/${action}`, {
        method: 'POST',
      });
      await load();
      toast({
        title: action === 'acknowledge' ? 'Recordatorio atendido' : 'Recordatorio descartado',
      });
    } catch (error) {
      toast({
        title: 'No se pudo actualizar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const isOpen = (r: ClinicalReminder): boolean =>
    r.status !== ReminderStatus.Acknowledged && r.status !== ReminderStatus.Dismissed;

  return (
    <PageContainer>
      <PageHeader
        title="Recordatorios"
        description="Recordatorios de vacunas y tratamientos de tu organización (RF09)."
      />
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && (
        <Card>
          <CardHeader>
            <CardTitle>Bandeja</CardTitle>
          </CardHeader>
          <CardContent>
            {reminders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay recordatorios.</p>
            ) : (
              <ul className="space-y-3">
                {reminders.map((reminder) => (
                  <li key={reminder.id} className="border-b pb-2 text-sm last:border-b-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {TYPE_LABELS[reminder.type as ReminderType] ?? reminder.type}
                      </span>
                      <Badge variant={statusVariant(reminder.status)}>
                        {STATUS_LABELS[reminder.status]}
                      </Badge>
                      <span className="text-muted-foreground">
                        Vence: {formatCO(reminder.dueDate)}
                      </span>
                    </div>
                    {canResolve && isOpen(reminder) && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          disabled={busy === reminder.id}
                          onClick={() => void resolve(reminder.id, 'acknowledge')}
                        >
                          Atender
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy === reminder.id}
                          onClick={() => void resolve(reminder.id, 'dismiss')}
                        >
                          Descartar
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}

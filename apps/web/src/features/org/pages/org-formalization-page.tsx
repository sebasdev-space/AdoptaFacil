import { useEffect, useState } from 'react';
import {
  FORMALIZATION_SEQUENCE,
  FormalizationState,
  type FormalizationStatus,
  type FormalizationTransition,
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
import { Role } from '@adoptafacil/contracts';
import { TextField } from '../components/profile-fields';

const STATE_LABELS: Record<FormalizationState, string> = {
  [FormalizationState.Informal]: 'Informal',
  [FormalizationState.EnProceso]: 'En proceso',
  [FormalizationState.Formalizada]: 'Formalizada',
  [FormalizationState.ESAL]: 'ESAL',
  [FormalizationState.ESAL_RTE]: 'ESAL + RTE',
};

interface TransitionResult {
  status: FormalizationStatus;
  transition: FormalizationTransition;
}

/** Formatea un instante UTC en hora de Colombia para la UI. */
function formatCO(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota' });
}

/** `/organizacion/formalizacion` — progreso de formalización (RF02). Cualquier
 *  miembro ve el estado/historial; solo el Owner puede avanzar/retroceder. */
export function OrgFormalizationPage() {
  const client = useApiClient();
  const { hasRole } = useSession();
  const canManage = hasRole(Role.Owner);

  const [status, setStatus] = useState<FormalizationStatus | null>(null);
  const [history, setHistory] = useState<FormalizationTransition[]>([]);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = async (): Promise<void> => {
    const [s, h] = await Promise.all([
      client.request<FormalizationStatus>('/org/formalization'),
      client.request<FormalizationTransition[]>('/org/formalization/history'),
    ]);
    setStatus(s);
    setHistory(h);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    client
      .request<FormalizationStatus>('/org/formalization')
      .then((s) =>
        client
          .request<FormalizationTransition[]>('/org/formalization/history')
          .then((h) => [s, h] as const),
      )
      .then(([s, h]) => {
        if (active) {
          setStatus(s);
          setHistory(h);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client]);

  const currentIndex = status ? FORMALIZATION_SEQUENCE.indexOf(status.state) : -1;
  const next = currentIndex >= 0 ? FORMALIZATION_SEQUENCE[currentIndex + 1] : undefined;
  const previous = currentIndex > 0 ? FORMALIZATION_SEQUENCE[currentIndex - 1] : undefined;

  const move = async (targetState: FormalizationState, requiresReason: boolean) => {
    if (requiresReason && !reason.trim()) {
      toast({
        title: 'Motivo requerido',
        description: 'Indica un motivo para retroceder.',
        variant: 'warning',
      });
      return;
    }
    setSaving(true);
    try {
      await client.request<TransitionResult>('/org/formalization/transitions', {
        method: 'POST',
        json: { targetState, ...(reason.trim() ? { reason: reason.trim() } : {}) },
      });
      setReason('');
      await load();
      toast({ title: 'Estado actualizado', description: `Ahora: ${STATE_LABELS[targetState]}.` });
    } catch (error) {
      toast({
        title: 'No se pudo cambiar el estado',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Formalización"
        description="Progreso de formalización de tu organización (RF02)."
      />
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && status && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Estado actual</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ol className="flex flex-wrap items-center gap-2">
                {FORMALIZATION_SEQUENCE.map((state, index) => (
                  <li key={state} className="flex items-center gap-2">
                    <Badge variant={index === currentIndex ? 'default' : 'secondary'}>
                      {STATE_LABELS[state]}
                    </Badge>
                    {index < FORMALIZATION_SEQUENCE.length - 1 && (
                      <span aria-hidden className="text-muted-foreground">
                        →
                      </span>
                    )}
                  </li>
                ))}
              </ol>
              {status.rteVigente && <Badge>RTE vigente</Badge>}

              {canManage && (
                <div className="space-y-3 border-t pt-4">
                  <TextField
                    id="formalization-reason"
                    label="Motivo (requerido para retroceder)"
                    value={reason}
                    onChange={setReason}
                  />
                  <div className="flex flex-wrap gap-2">
                    {next && (
                      <Button disabled={saving} onClick={() => void move(next, false)}>
                        Avanzar a {STATE_LABELS[next]}
                      </Button>
                    )}
                    {previous && (
                      <Button
                        variant="outline"
                        disabled={saving}
                        onClick={() => void move(previous, true)}
                      >
                        Retroceder a {STATE_LABELS[previous]}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Historial</CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no hay cambios de estado.</p>
              ) : (
                <ul className="space-y-3">
                  {[...history].reverse().map((entry) => (
                    <li key={entry.id} className="border-b pb-2 text-sm last:border-b-0">
                      <span className="font-medium">
                        {STATE_LABELS[entry.fromState]} → {STATE_LABELS[entry.toState]}
                      </span>
                      <span className="ml-2 text-muted-foreground">
                        {formatCO(entry.createdAt)}
                      </span>
                      {entry.reason && (
                        <p className="text-muted-foreground">Motivo: {entry.reason}</p>
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

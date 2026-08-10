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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  ProgressStepper,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { formalizationSteps } from '../../_layout/model/formalization-stepper-view';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { Role } from '@adoptafacil/contracts';
import { TextField } from '../components/profile-fields';
import styles from './org-formalization-page.module.scss';

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
  // REFACTOR-VISUAL Fase C3: la transición pendiente de confirmar en el modal
  // (null = modal cerrado). `requiresReason` decide si el modal pide motivo.
  const [pendingTransition, setPendingTransition] = useState<{
    targetState: FormalizationState;
    requiresReason: boolean;
  } | null>(null);
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
      setPendingTransition(null);
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

  const closeTransitionModal = (): void => {
    setPendingTransition(null);
    setReason('');
  };

  return (
    <PageContainer>
      <PageHeader
        title="Formalización"
        description="Progreso de formalización de tu organización."
      />
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && status && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Estado actual</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ProgressStepper steps={formalizationSteps()} currentIndex={currentIndex} />
              {status.rteVigente && <Badge>RTE vigente</Badge>}

              {canManage && (next || previous) && (
                <div className={styles.actions}>
                  {next && (
                    <Button
                      onClick={() =>
                        setPendingTransition({ targetState: next, requiresReason: false })
                      }
                    >
                      Avanzar a {STATE_LABELS[next]}
                    </Button>
                  )}
                  {previous && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        setPendingTransition({ targetState: previous, requiresReason: true })
                      }
                    >
                      Retroceder a {STATE_LABELS[previous]}
                    </Button>
                  )}
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
                <EmptyState title="Aún no hay cambios de estado." />
              ) : (
                <ul className="space-y-3">
                  {[...history].reverse().map((entry) => (
                    <li key={entry.id} className={styles['history__row']}>
                      <span className={styles['history__transition']}>
                        {STATE_LABELS[entry.fromState]} → {STATE_LABELS[entry.toState]}
                      </span>
                      <span className={styles['history__date']}>{formatCO(entry.createdAt)}</span>
                      {entry.reason && (
                        <p className={styles['history__reason']}>Motivo: {entry.reason}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* REFACTOR-VISUAL Fase C3: el motivo (cuando aplica) se pide en modal,
          no como campo embebido junto a las tarjetas de estado/historial. */}
      <Dialog
        open={pendingTransition !== null}
        onOpenChange={(open) => !open && closeTransitionModal()}
      >
        <DialogContent>
          {pendingTransition && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {pendingTransition.requiresReason ? 'Retroceder a' : 'Avanzar a'}{' '}
                  {STATE_LABELS[pendingTransition.targetState]}
                </DialogTitle>
                <DialogDescription>
                  {pendingTransition.requiresReason
                    ? 'Retroceder el estado de formalización requiere un motivo — quedará en el historial.'
                    : 'Este cambio de estado quedará registrado en el historial de la organización.'}
                </DialogDescription>
              </DialogHeader>
              {pendingTransition.requiresReason && (
                <TextField
                  id="formalization-reason"
                  label="Motivo"
                  value={reason}
                  onChange={setReason}
                />
              )}
              <DialogFooter>
                <Button variant="outline" onClick={closeTransitionModal}>
                  Cancelar
                </Button>
                <Button
                  disabled={saving}
                  onClick={() =>
                    void move(pendingTransition.targetState, pendingTransition.requiresReason)
                  }
                >
                  {saving
                    ? 'Guardando…'
                    : `${pendingTransition.requiresReason ? 'Retroceder' : 'Avanzar'} a ${STATE_LABELS[pendingTransition.targetState]}`}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

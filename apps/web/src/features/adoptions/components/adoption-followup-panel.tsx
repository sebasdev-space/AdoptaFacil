import { useCallback, useEffect, useState } from 'react';
import type { AdoptionFollowUpMilestone } from '@adoptafacil/contracts';
import { Badge, Button, Input, Skeleton, useToast } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import {
  completeFollowUp,
  listFollowUpsForContract,
  scheduleFollowUpMilestone,
} from '../api/adoptions-api';
import { formatBogota } from '../model/adoptions-view';
import { FOLLOWUP_STATUS_LABELS, followUpStatusVariant } from '../model/adoptions-followup-view';

export interface AdoptionFollowUpPanelProps {
  contractId: string;
  /** Whether the current user may schedule/close milestones (org roles). */
  canManage: boolean;
}

/**
 * Post-adoption follow-up panel (§M04, T-028c, RF12), shown once a contract is
 * signed. Org roles schedule milestones (title + due date + questionnaire) and
 * close them; a milestone past its due date shows as "Vencido" (the worker marks
 * it and alerts the adopter). Due dates are stored UTC and shown in hora Colombia.
 */
export function AdoptionFollowUpPanel({ contractId, canManage }: AdoptionFollowUpPanelProps) {
  const client = useApiClient();
  const { toast } = useToast();

  const [milestones, setMilestones] = useState<AdoptionFollowUpMilestone[] | undefined>(undefined);
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    listFollowUpsForContract(client, contractId)
      // Normalize at the data edge: the panel ALWAYS holds an array. Guards against
      // a non-array/empty response so the first render (and `.map`) never throws.
      .then((data) => setMilestones(Array.isArray(data) ? data : []))
      .catch(() => setMilestones([]));
  }, [client, contractId]);

  useEffect(() => load(), [load]);

  const schedule = useCallback(async () => {
    if (!title.trim() || !dueAt) {
      toast({ title: 'Título y fecha son obligatorios', variant: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await scheduleFollowUpMilestone(client, {
        contractId,
        title: title.trim(),
        dueAt: new Date(dueAt).toISOString(),
      });
      setTitle('');
      setDueAt('');
      load();
      toast({ title: 'Hito de seguimiento programado' });
    } catch {
      toast({ title: 'No se pudo programar el hito', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }, [client, contractId, title, dueAt, load, toast]);

  const close = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await completeFollowUp(client, id);
        load();
        toast({ title: 'Hito completado' });
      } catch {
        toast({ title: 'No se pudo completar el hito', variant: 'destructive' });
      } finally {
        setBusy(false);
      }
    },
    [client, load, toast],
  );

  if (milestones === undefined) return <Skeleton className="h-12 w-full" />;

  return (
    <div className="space-y-2 rounded-md border border-dashed p-2 text-xs">
      <p className="font-medium">Seguimiento post-adopción</p>

      {milestones.length === 0 ? (
        <p className="text-muted-foreground">Sin hitos programados.</p>
      ) : (
        <ul className="space-y-1">
          {milestones.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1 truncate">{m.title}</span>
              <span className="text-muted-foreground">{formatBogota(m.dueAt)}</span>
              <Badge variant={followUpStatusVariant(m.status)}>
                {FOLLOWUP_STATUS_LABELS[m.status]}
              </Badge>
              {canManage && m.status !== 'completed' && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void close(m.id)}
                >
                  Completar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="flex flex-wrap items-end gap-2 pt-1">
          <Input
            aria-label="Título del hito"
            placeholder="Título del hito"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-8 flex-1"
          />
          <Input
            aria-label="Fecha del hito"
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="h-8"
          />
          <Button size="sm" disabled={busy} onClick={() => void schedule()}>
            Programar hito
          </Button>
        </div>
      )}
    </div>
  );
}

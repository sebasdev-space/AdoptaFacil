import { useEffect, useState } from 'react';
import { Role, type ReviewDecision, type ReviewModerationQueueItem } from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  useToast,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { useSession } from '../../../shell/auth';
import { TextField } from '../components/profile-fields';
import styles from './platform-reviews-review-page.module.scss';

function formatCO(iso?: string): string {
  return iso ? new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : '—';
}

/**
 * `/plataforma/resenas` — cola de moderación de reseñas, cross-tenant (RF23).
 * Solo PlatformAdmin/PlatformSuperAdmin — nunca la organización reseñada
 * (conflicto de interés, mismo criterio que S-3 y `/plataforma/documentos`).
 * Muestra pendientes (aprobar/rechazar) y aprobadas (ocultar, tras un
 * reporte posterior) — rechazadas/ocultas ya no requieren acción y no
 * aparecen aquí (quedan en el registro de auditoría).
 */
export function PlatformReviewsReviewPage() {
  const client = useApiClient();
  const { hasRole } = useSession();
  const canReview = hasRole(Role.PlatformAdmin) || hasRole(Role.PlatformSuperAdmin);
  const { toast } = useToast();

  const [queue, setQueue] = useState<ReviewModerationQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    const items = await client.request<ReviewModerationQueueItem[]>('/platform/reviews/queue');
    setQueue(items);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const items = await client.request<ReviewModerationQueueItem[]>('/platform/reviews/queue');
        if (active) setQueue(items);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client]);

  const decide = async (id: string, decision: ReviewDecision): Promise<void> => {
    const reason = reasons[id]?.trim();
    if (decision === 'reject' && !reason) {
      toast({ title: 'Motivo requerido', description: 'Indica el motivo.', variant: 'warning' });
      return;
    }
    setBusy(id);
    try {
      await client.request(`/platform/reviews/${id}/decision`, {
        method: 'POST',
        json: { decision, ...(reason ? { reason } : {}) },
      });
      await load();
      toast({ title: 'Decisión registrada' });
    } catch (error) {
      toast({
        title: 'No se pudo registrar la decisión',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const hideReview = async (id: string): Promise<void> => {
    const reason = reasons[id]?.trim();
    if (!reason) {
      toast({ title: 'Motivo requerido', description: 'Indica el motivo.', variant: 'warning' });
      return;
    }
    setBusy(id);
    try {
      await client.request(`/platform/reviews/${id}/hide`, { method: 'POST', json: { reason } });
      await load();
      toast({ title: 'Reseña ocultada' });
    } catch (error) {
      toast({
        title: 'No se pudo ocultar la reseña',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  if (!canReview) {
    return (
      <PageContainer>
        <PageHeader title="Moderación de reseñas" description="Acceso restringido." />
        <EmptyState title="Sin acceso" description="No tienes permisos de plataforma." />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Moderación de reseñas"
        description="Cola de reseñas pendientes y aprobadas de todas las organizaciones."
      />
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && (
        <div className={styles.queue}>
          {queue.length === 0 ? (
            <EmptyState title="No hay reseñas por moderar." />
          ) : (
            queue.map((item) => (
              <Card key={item.id}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {item.organizationName} · {item.authorName} · {'★'.repeat(item.rating)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className={styles['item__meta']}>
                    <Badge variant="secondary">{item.status}</Badge>
                    {item.isAnonymous && <Badge variant="secondary">Anónima al público</Badge>}
                    <span>Enviada: {formatCO(item.createdAt)}</span>
                  </div>
                  {item.comment && <p className="text-sm">{item.comment}</p>}
                  <TextField
                    id={`reason-${item.id}`}
                    label="Motivo (requerido para rechazar/ocultar)"
                    value={reasons[item.id] ?? ''}
                    onChange={(value) => setReasons((prev) => ({ ...prev, [item.id]: value }))}
                  />
                  <div className={styles['item__actions']}>
                    {item.status === 'pending' && (
                      <>
                        <Button
                          disabled={busy === item.id}
                          onClick={() => void decide(item.id, 'approve')}
                        >
                          Aprobar
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy === item.id}
                          onClick={() => void decide(item.id, 'reject')}
                        >
                          Rechazar
                        </Button>
                      </>
                    )}
                    {item.status === 'approved' && (
                      <Button
                        variant="outline"
                        disabled={busy === item.id}
                        onClick={() => void hideReview(item.id)}
                      >
                        Ocultar (reporte)
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </PageContainer>
  );
}

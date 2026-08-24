import { useEffect, useState } from 'react';
import {
  Role,
  type OrganizationDuplicateFlag,
  type ReviewOrganizationDuplicateInput,
} from '@adoptafacil/contracts';
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
import styles from './platform-duplicates-review-page.module.scss';

function formatCO(iso?: string): string {
  return iso ? new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : '—';
}

function formatScore(score?: number): string {
  return typeof score === 'number' ? `${Math.round(score * 100)}%` : '—';
}

/** `/plataforma/organizaciones-duplicadas` — cola de revisión cross-tenant de
 *  posibles duplicados por nombre similar (M01, S-3). Solo
 *  PlatformAdmin/PlatformSuperAdmin. Un NIT exacto nunca llega aquí — se
 *  bloquea de una vez al guardar, sin necesitar revisión. */
export function PlatformDuplicatesReviewPage() {
  const client = useApiClient();
  const { hasRole } = useSession();
  const canReview = hasRole(Role.PlatformAdmin) || hasRole(Role.PlatformSuperAdmin);
  const { toast } = useToast();

  const [queue, setQueue] = useState<OrganizationDuplicateFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    const items = await client.request<OrganizationDuplicateFlag[]>('/platform/duplicates/queue');
    setQueue(items);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const items = await client.request<OrganizationDuplicateFlag[]>(
          '/platform/duplicates/queue',
        );
        if (active) setQueue(items);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client]);

  const decide = async (
    id: string,
    decision: ReviewOrganizationDuplicateInput['decision'],
  ): Promise<void> => {
    setBusy(id);
    try {
      await client.request<OrganizationDuplicateFlag>(`/platform/duplicates/${id}/decision`, {
        method: 'POST',
        json: { decision },
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

  if (!canReview) {
    return (
      <PageContainer>
        <PageHeader title="Organizaciones duplicadas" description="Acceso restringido." />
        <EmptyState title="Sin acceso" description="No tienes permisos de plataforma." />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Organizaciones duplicadas"
        description="Casos de nombre similar entre organizaciones, marcados para revisión. Una coincidencia exacta de NIT ya se bloqueó al guardar — nunca llega a esta cola."
      />
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && (
        <div className={styles.queue}>
          {queue.length === 0 ? (
            <EmptyState title="No hay casos pendientes de revisión." />
          ) : (
            queue.map((item) => (
              <Card key={item.id}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {item.organizationName} ↔ {item.matchedOrganizationName}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className={styles['item__meta']}>
                    <Badge variant="warning">Nombre similar</Badge>
                    <span>Similitud: {formatScore(item.similarityScore)}</span>
                    <span>Marcado: {formatCO(item.createdAt)}</span>
                  </div>
                  <div className={styles['item__actions']}>
                    <Button
                      variant="outline"
                      disabled={busy === item.id}
                      onClick={() => void decide(item.id, 'dismiss')}
                    >
                      Descartar (no es duplicado)
                    </Button>
                    <Button
                      disabled={busy === item.id}
                      onClick={() => void decide(item.id, 'confirm')}
                    >
                      Confirmar duplicado
                    </Button>
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

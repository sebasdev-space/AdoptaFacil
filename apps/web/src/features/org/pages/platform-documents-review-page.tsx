import { useEffect, useState } from 'react';
import {
  DocumentType,
  Role,
  type DocumentReviewDecision,
  type DocumentReviewQueueItem,
  type OrganizationDocument,
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
import { TextField } from '../components/profile-fields';

const TYPE_LABELS: Record<string, string> = {
  [DocumentType.ExistenceRepresentationCertificate]: 'Certificado de existencia y representación',
  [DocumentType.Rut]: 'RUT',
  [DocumentType.LegalRepresentativeId]: 'Documento del representante legal',
  [DocumentType.Other]: 'Otro',
};

function formatCO(iso?: string): string {
  return iso ? new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : '—';
}

/** `/plataforma/documentos` — cola de revisión cross-tenant (RF03). Solo
 *  PlatformAdmin/PlatformSuperAdmin. Observar/rechazar exigen motivo. */
export function PlatformDocumentsReviewPage() {
  const client = useApiClient();
  const { hasRole } = useSession();
  const canReview = hasRole(Role.PlatformAdmin) || hasRole(Role.PlatformSuperAdmin);
  const { toast } = useToast();

  const [queue, setQueue] = useState<DocumentReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    const items = await client.request<DocumentReviewQueueItem[]>('/platform/documents/queue');
    setQueue(items);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const items = await client.request<DocumentReviewQueueItem[]>('/platform/documents/queue');
        if (active) setQueue(items);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client]);

  const review = async (id: string, decision: DocumentReviewDecision): Promise<void> => {
    const note = notes[id]?.trim();
    if ((decision === 'observe' || decision === 'reject') && !note) {
      toast({ title: 'Motivo requerido', description: 'Indica el motivo.', variant: 'warning' });
      return;
    }
    setBusy(id);
    try {
      await client.request<OrganizationDocument>(`/platform/documents/${id}/decision`, {
        method: 'POST',
        json: { decision, ...(note ? { note } : {}) },
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
        <PageHeader title="Revisión de documentos" description="Acceso restringido." />
        <p className="text-sm text-muted-foreground">No tienes permisos de plataforma.</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Revisión de documentos"
        description="Cola de verificación documental de todas las organizaciones (RF03)."
      />
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && (
        <div className="space-y-4">
          {queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay documentos por revisar.</p>
          ) : (
            queue.map((item) => (
              <Card key={item.id}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {item.organizationName} · {TYPE_LABELS[item.type] ?? item.type} v{item.version}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                    <Badge variant="secondary">{item.status}</Badge>
                    <span>Subido: {formatCO(item.createdAt)}</span>
                    <span>Vence: {formatCO(item.expiresAt)}</span>
                  </div>
                  <TextField
                    id={`note-${item.id}`}
                    label="Motivo (requerido para observar/rechazar)"
                    value={notes[item.id] ?? ''}
                    onChange={(value) => setNotes((prev) => ({ ...prev, [item.id]: value }))}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={busy === item.id}
                      onClick={() => void review(item.id, 'approve')}
                    >
                      Aprobar
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy === item.id}
                      onClick={() => void review(item.id, 'observe')}
                    >
                      Observar
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy === item.id}
                      onClick={() => void review(item.id, 'reject')}
                    >
                      Rechazar
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

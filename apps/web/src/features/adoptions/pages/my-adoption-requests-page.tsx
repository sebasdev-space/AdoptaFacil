import { useCallback, useEffect, useState } from 'react';
import type { AdoptionRequest } from '@adoptafacil/contracts';
import { Badge, Button, Card, CardContent, Skeleton } from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import { listMyAdoptionRequests } from '../api/adoptions-api';
import {
  ADOPTION_STATUS_LABELS,
  adoptionStatusVariant,
  formatBogota,
} from '../model/adoptions-view';
import { normalizeMine, organizationLabel } from '../model/my-adoption-requests-view';
import { MyRequestDetailModal } from '../components/my-request-detail-modal';

/**
 * "Mis solicitudes" (F1-01) — historial de solicitudes de adopción de la
 * Persona autenticada, vía `GET /adoptions/mine` (cross-tenant por identidad,
 * mismo patrón que "Mis donaciones", T-064). Entrada de nav SEPARADA del
 * kanban de organización `/adopciones` (gateado a Owner/Administrador/Operador,
 * PR #86) — esta vista es exclusivamente para quien NO tiene ese rol.
 */
export function MyAdoptionRequestsPage() {
  const client = useApiClient();
  const [requests, setRequests] = useState<AdoptionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailRequest = requests.find((r) => r.id === detailId) ?? null;

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    listMyAdoptionRequests(client)
      .then((body) => setRequests(normalizeMine(body)))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [client]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageContainer>
      <PageHeader
        title="Mis solicitudes"
        description="Solicitudes de adopción que has enviado, con su estado actual."
      />
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Card>
          <CardContent className="pt-6">
            {error && (
              <p className="text-sm text-destructive">
                No se pudieron cargar tus solicitudes. Inténtalo de nuevo más tarde.
              </p>
            )}
            {!error && requests.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Aún no has enviado ninguna solicitud. Encuentra un animal en adopción desde el
                portal general para solicitarlo.
              </p>
            )}
            {!error && requests.length > 0 && (
              <ul className="space-y-3">
                {requests.map((request) => (
                  <li key={request.id} className="border-b pb-3 text-sm last:border-b-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{request.animalSnapshot.name}</span>
                      <Badge variant={adoptionStatusVariant(request.status)}>
                        {ADOPTION_STATUS_LABELS[request.status]}
                      </Badge>
                      <span className="ml-auto text-muted-foreground">
                        {formatBogota(request.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground">{organizationLabel(request)}</p>
                    <div className="mt-2">
                      <Button variant="outline" onClick={() => setDetailId(request.id)}>
                        Ver detalle
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
      <MyRequestDetailModal
        request={detailRequest}
        onOpenChange={(open) => !open && setDetailId(null)}
      />
    </PageContainer>
  );
}

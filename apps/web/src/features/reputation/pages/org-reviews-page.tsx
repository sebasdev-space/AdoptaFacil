import { useEffect, useState } from 'react';
import { Role, ReviewStatus, type Review } from '@adoptafacil/contracts';
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
import {
  REVIEW_STATUS_LABELS,
  formatBogota,
  ratingStars,
  reviewStatusVariant,
} from '../model/reputation-view';

/**
 * `/organizacion/resenas` (fix, M12/S7-b) — lo que el Owner/Administrator
 * necesita para poder usar `POST /reviews/:id/mark-spam`, que ya existía pero
 * no tenía ningún lugar en la UI desde donde encontrar el id de una reseña:
 * el botón "Registrar reseña" del portal público SÍ guardaba la reseña, pero
 * la organización no tenía cómo VERLA para poder marcarla como spam.
 *
 * Muestra SOLO las reseñas PÚBLICAS/anónimas de la propia organización — las
 * únicas que este rol puede moderar (`GET /reviews/org`, mismo criterio que
 * el backend). Las reseñas autenticadas (RF23 original) nunca aparecen aquí:
 * su moderación sigue siendo exclusiva de PlatformAdmin (conflicto de
 * interés, S-7) — esta página ni siquiera las lee.
 */
export function OrgReviewsPage() {
  const client = useApiClient();
  const { hasAnyRole } = useSession();
  const canModerate = hasAnyRole(Role.Owner, Role.Administrator);
  const { toast } = useToast();

  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    const items = await client.request<Review[]>('/reviews/org');
    setReviews(Array.isArray(items) ? items : []);
  };

  useEffect(() => {
    if (!canModerate) {
      setLoading(false);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const items = await client.request<Review[]>('/reviews/org');
        if (active) setReviews(Array.isArray(items) ? items : []);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client, canModerate]);

  const markSpam = async (id: string): Promise<void> => {
    setBusy(id);
    try {
      await client.request(`/reviews/${id}/mark-spam`, { method: 'POST' });
      await load();
      toast({ title: 'Reseña marcada como spam', description: 'Ya no se muestra en tu portal.' });
    } catch (error) {
      toast({
        title: 'No se pudo marcar como spam',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  if (!canModerate) {
    return (
      <PageContainer>
        <PageHeader title="Reseñas de tu portal" description="Acceso restringido." />
        <EmptyState
          title="Sin acceso"
          description="Solo el propietario o un administrador de la organización puede moderar reseñas."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Reseñas de tu portal"
        description="Reseñas públicas y anónimas registradas desde el portal de tu organización."
      />
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && (
        <Card>
          <CardHeader>
            <CardTitle>Reseñas recibidas</CardTitle>
          </CardHeader>
          <CardContent>
            {reviews.length === 0 ? (
              <EmptyState title="Aún no has recibido ninguna reseña." />
            ) : (
              <ul className="space-y-3">
                {reviews.map((review) => (
                  <li key={review.id} className="space-y-2 rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{ratingStars(review.rating)}</p>
                      <Badge variant={reviewStatusVariant(review.status)}>
                        {REVIEW_STATUS_LABELS[review.status]}
                      </Badge>
                    </div>
                    {review.comment && <p className="text-muted-foreground">{review.comment}</p>}
                    <p className="text-xs text-muted-foreground">
                      {formatBogota(review.createdAt)}
                    </p>
                    {review.status === ReviewStatus.Approved && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === review.id}
                        onClick={() => void markSpam(review.id)}
                      >
                        Marcar como spam
                      </Button>
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

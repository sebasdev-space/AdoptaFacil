import { useEffect, useState } from 'react';
import { type ReviewMine } from '@adoptafacil/contracts';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import {
  REVIEW_STATUS_LABELS,
  formatBogota,
  ratingStars,
  reviewStatusVariant,
} from '../model/reputation-view';

/**
 * `/resenas` (RF23, M12) — "Mis reseñas": lo que la Persona ha reseñado, con
 * su estado de moderación actual. Solo lectura (el contenido es inmutable
 * tras el envío, RF23) — para reseñar una organización, la Persona lo hace
 * desde la página pública de esa organización
 * (`/organizaciones/:slug/resenas`).
 */
export function MyReviewsPage() {
  const client = useApiClient();
  const [reviews, setReviews] = useState<ReviewMine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const list = await client.request<ReviewMine[]>('/reviews/mine');
        if (active) setReviews(Array.isArray(list) ? list : []);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client]);

  return (
    <PageContainer>
      <PageHeader title="Mis reseñas" description="Las reseñas que has enviado y su estado." />
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && (
        <Card>
          <CardHeader>
            <CardTitle>Reseñas enviadas</CardTitle>
          </CardHeader>
          <CardContent>
            {reviews.length === 0 ? (
              <EmptyState title="Aún no has enviado ninguna reseña." />
            ) : (
              <ul className="space-y-3">
                {reviews.map((review) => (
                  <li key={review.id} className="space-y-1 rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">
                        {ratingStars(review.rating)} · {review.organizationName}
                      </p>
                      <Badge variant={reviewStatusVariant(review.status)}>
                        {REVIEW_STATUS_LABELS[review.status]}
                      </Badge>
                    </div>
                    {review.comment && <p className="text-muted-foreground">{review.comment}</p>}
                    {review.status === 'rejected' && review.rejectionReason && (
                      <p className="text-xs text-muted-foreground">
                        Motivo: {review.rejectionReason}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatBogota(review.createdAt)}
                    </p>
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

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  type CreateReviewInput,
  type OrganizationReputationSummary,
  type PublicReview,
  type ReviewMine,
} from '@adoptafacil/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
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
 * `/organizaciones/:slug/resenas` (RF23, M12) — indicadores públicos de
 * confianza de UNA organización: promedio, conteo y reseñas aprobadas (sin
 * autenticación, mismo patrón que `PublicCampaignDetailPage`). Un visitante
 * autenticado que aún no reseñó esta organización puede hacerlo aquí; si ya
 * lo hizo, ve el estado de su propia reseña en su lugar (nunca un formulario
 * de edición — el contenido es inmutable, RF23).
 */
export function OrganizationReputationPage() {
  const { slug } = useParams<{ slug: string }>();
  const client = useApiClient();
  const { status: sessionStatus } = useSession();
  const { toast } = useToast();

  const [summary, setSummary] = useState<OrganizationReputationSummary | null>(null);
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [myReview, setMyReview] = useState<ReviewMine | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [rating, setRating] = useState('5');
  const [comment, setComment] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let active = true;
    void (async () => {
      try {
        const [summaryData, reviewsPage] = await Promise.all([
          client.request<OrganizationReputationSummary>(
            `/public/organizations/${slug}/reputation-summary`,
          ),
          client.request<{ items: PublicReview[] }>(
            `/public/organizations/${slug}/reviews?limit=50`,
          ),
        ]);
        if (!active) return;
        setSummary(summaryData);
        setReviews(Array.isArray(reviewsPage?.items) ? reviewsPage.items : []);

        if (sessionStatus === 'authenticated') {
          const mine = await client.request<ReviewMine[]>('/reviews/mine');
          if (!active) return;
          const existing = mine.find((r) => r.organizationId === summaryData.organizationId);
          setMyReview(existing ?? null);
        }
      } catch {
        if (active) setNotFound(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [client, slug, sessionStatus]);

  const submit = async (): Promise<void> => {
    if (!summary) return;
    const parsedRating = Number(rating);
    setSubmitting(true);
    try {
      const input: CreateReviewInput = {
        organizationId: summary.organizationId,
        rating: parsedRating,
        comment: comment.trim() || undefined,
        isAnonymous,
      };
      const created = await client.request<ReviewMine>('/reviews', { method: 'POST', json: input });
      setMyReview({ ...created, organizationName: '' });
      toast({ title: 'Reseña enviada', description: 'Quedará visible una vez sea aprobada.' });
    } catch (error) {
      toast({
        title: 'No se pudo enviar la reseña',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (notFound) {
    return (
      <PageContainer>
        <PageHeader title="Reseñas" description="Indicadores públicos de confianza." />
        <EmptyState title="Organización no encontrada" />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader title="Reseñas" description="Indicadores públicos de confianza (RF23)." />
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && summary && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>
                {ratingStars(summary.averageRating)} {summary.averageRating.toFixed(2)} ·{' '}
                {summary.approvedReviewsCount}{' '}
                {summary.approvedReviewsCount === 1 ? 'reseña' : 'reseñas'}
              </CardTitle>
            </CardHeader>
          </Card>

          {sessionStatus === 'authenticated' && (
            <Card>
              <CardHeader>
                <CardTitle>Tu reseña</CardTitle>
              </CardHeader>
              <CardContent>
                {myReview ? (
                  <div className="space-y-2 text-sm">
                    <Badge variant={reviewStatusVariant(myReview.status)}>
                      {REVIEW_STATUS_LABELS[myReview.status]}
                    </Badge>
                    <p>{ratingStars(myReview.rating)}</p>
                    {myReview.comment && (
                      <p className="text-muted-foreground">{myReview.comment}</p>
                    )}
                    {myReview.status === 'rejected' && myReview.rejectionReason && (
                      <p className="text-xs text-muted-foreground">
                        Motivo: {myReview.rejectionReason}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="review-rating"
                        className="block text-sm font-medium text-foreground"
                      >
                        Calificación (1-5)
                      </label>
                      <select
                        id="review-rating"
                        value={rating}
                        onChange={(e) => setRating(e.target.value)}
                        className="block w-full rounded-md border p-2 text-sm"
                      >
                        {[5, 4, 3, 2, 1].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label
                        htmlFor="review-comment"
                        className="block text-sm font-medium text-foreground"
                      >
                        Comentario (opcional)
                      </label>
                      <Input
                        id="review-comment"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={isAnonymous}
                        onChange={(e) => setIsAnonymous(e.target.checked)}
                      />
                      Publicar de forma anónima
                    </label>
                    <Button disabled={submitting} onClick={() => void submit()}>
                      {submitting ? 'Enviando…' : 'Enviar reseña'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Reseñas</CardTitle>
            </CardHeader>
            <CardContent>
              {reviews.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no hay reseñas aprobadas.</p>
              ) : (
                <ul className="space-y-3">
                  {reviews.map((review) => (
                    <li key={review.id} className="rounded-md border p-3 text-sm">
                      <p className="font-medium">
                        {ratingStars(review.rating)} · {review.authorName ?? 'Anónimo'}
                      </p>
                      {review.comment && <p className="text-muted-foreground">{review.comment}</p>}
                      <p className="text-xs text-muted-foreground">
                        {formatBogota(review.createdAt)}
                      </p>
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

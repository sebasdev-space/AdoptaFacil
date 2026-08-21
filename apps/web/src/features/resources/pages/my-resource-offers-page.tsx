import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ResourceOfferWithNeed } from '@adoptafacil/contracts';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  buttonVariants,
  cn,
} from '@adoptafacil/ui';
import { PageContainer, PageHeader } from '../../_layout';
import { useApiClient } from '../../../shell/api';
import {
  DELIVERY_STATUS_LABELS,
  OFFER_STATUS_LABELS,
  offerStatusVariant,
} from '../model/resources-view';

/**
 * `/mis-ofertas` (M09, F-6) — las ofertas de donación física del usuario
 * autenticado, cross-tenant por identidad (`GET /resources/offers/mine`), sin
 * `@Roles` en el backend — cualquier autenticado, mismo criterio que "Mis
 * donaciones"/"Mis apadrinamientos".
 */
export function MyResourceOffersPage() {
  const client = useApiClient();
  const [offers, setOffers] = useState<ResourceOfferWithNeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const rows = await client.request<ResourceOfferWithNeed[]>('/resources/offers/mine');
        if (active) setOffers(Array.isArray(rows) ? rows : []);
      } catch {
        if (active) setError(true);
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
      <PageHeader
        title="Mis ofertas"
        description="Ofertas de donación física que has enviado a las organizaciones."
      />
      {loading && <Skeleton className="h-64 w-full" />}
      {!loading && error && (
        <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
      )}
      {!loading && !error && offers.length === 0 && (
        <EmptyState
          title="Aún no has ofrecido ninguna donación"
          description="Explora el banco de recursos y ofrece ayuda a una necesidad."
          action={
            <Link to="/recursos" className={cn(buttonVariants())}>
              Ver necesidades
            </Link>
          }
        />
      )}
      {!loading && !error && offers.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {offers.map((offer) => (
            <Card key={offer.id} data-testid="my-offer-card">
              <CardHeader className="gap-2">
                <CardTitle className="text-base">{offer.needTitle}</CardTitle>
                <p className="text-xs text-muted-foreground">{offer.organizationName}</p>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm">
                  {offer.quantityOffered} {offer.needUnit}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={offerStatusVariant(offer.status)}>
                    {OFFER_STATUS_LABELS[offer.status]}
                  </Badge>
                  {offer.deliveryStatus && (
                    <Badge variant="secondary">
                      {DELIVERY_STATUS_LABELS[offer.deliveryStatus]}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}

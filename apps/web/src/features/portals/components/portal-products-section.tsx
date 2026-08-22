import { useEffect, useState } from 'react';
import type { ProductPublic } from '@adoptafacil/contracts';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from '@adoptafacil/ui';
import { listPublicProducts } from '../../marketplace/api/public-marketplace';
import { ProductCard } from '../../marketplace/components/product-card';

const PAGE_SIZE = 12;
const HEADING_ID = 'portal-section-products';

type SectionState = 'loading' | 'ready' | 'error';

export interface PortalProductsSectionProps {
  organizationId: string;
}

/**
 * Sección "Productos" del portal público (§M14/M10, F-MKT-PORTAL-1 — cierra
 * el hallazgo QA: el marketplace de una organización nunca era visible desde
 * SU portal, solo desde el catálogo general `/marketplace`). Mismo patrón
 * que `PortalAdoptionSection`/`PortalCampaignsSection`: fetch por
 * organización, `.items` ya normalizado a `[]` por `listPublicProducts`
 * (blindaje T-028c), estado vacío explícito, "cargar más" real. Reutiliza
 * `ProductCard` TAL CUAL — la misma tarjeta del catálogo público general—
 * para no duplicarla ni divergir visualmente (incluye el aviso de no
 * garantía de entrega y el enlace de WhatsApp en el detalle).
 */
export function PortalProductsSection({ organizationId }: PortalProductsSectionProps) {
  const [items, setItems] = useState<ProductPublic[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<SectionState>('loading');
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let active = true;
    setState('loading');
    listPublicProducts({ organizationId, limit: PAGE_SIZE, offset: 0 })
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setTotal(page.total);
        setState('ready');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [organizationId]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const page = await listPublicProducts({
        organizationId,
        limit: PAGE_SIZE,
        offset: items.length,
      });
      setItems((prev) => [...prev, ...page.items]);
      setTotal(page.total);
    } catch {
      // Conserva lo ya cargado; el usuario puede reintentar.
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section aria-labelledby={HEADING_ID} data-testid="portal-products-section">
      <Card>
        <CardHeader>
          <CardTitle id={HEADING_ID}>Productos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === 'loading' && <Skeleton className="h-40 w-full" />}
          {state === 'error' && (
            <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
          )}
          {state === 'ready' && items.length === 0 && (
            <EmptyState
              title="Sin productos publicados"
              description="Esta organización no tiene productos activos en el marketplace por ahora."
            />
          )}
          {state === 'ready' && items.length > 0 && (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {items.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
              {items.length < total && (
                <Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>
                  {loadingMore ? 'Cargando…' : 'Cargar más'}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

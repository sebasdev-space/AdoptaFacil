import { useEffect, useState } from 'react';
import type { ResourceNeedPublic } from '@adoptafacil/contracts';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from '@adoptafacil/ui';
import { listPublicNeeds } from '../../resources/api/public-resources';
import { NeedCard } from '../../resources/components/need-card';

const PAGE_SIZE = 12;
const HEADING_ID = 'portal-section-needs';

type SectionState = 'loading' | 'ready' | 'error';

export interface PortalNeedsSectionProps {
  organizationId: string;
}

/**
 * Sección "Necesita hoy" del portal público (§M14/M09, F-NEEDS-PORTAL-1 —
 * cierra el hallazgo QA: `/o/:slug` ya mostraba animales, campaña activa y
 * marketplace, pero el banco de recursos (M09) seguía en
 * `status: 'placeholder'` porque el catálogo público de necesidades no
 * aceptaba ningún filtro por organización). Mismo patrón EXACTO que
 * `PortalProductsSection` (que cerró el mismo hueco para el marketplace,
 * F-MKT-PORTAL-1): fetch por organización, `.items` ya normalizado a `[]`
 * por `listPublicNeeds` (blindaje T-028c), estado vacío explícito, "cargar
 * más" real. Reutiliza `NeedCard` TAL CUAL —la misma tarjeta del catálogo
 * público general (`/recursos`)— para no duplicarla ni divergir visualmente.
 */
export function PortalNeedsSection({ organizationId }: PortalNeedsSectionProps) {
  const [items, setItems] = useState<ResourceNeedPublic[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<SectionState>('loading');
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let active = true;
    setState('loading');
    listPublicNeeds({ organizationId, limit: PAGE_SIZE, offset: 0 })
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
      const page = await listPublicNeeds({
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
    <section aria-labelledby={HEADING_ID} data-testid="portal-needs-section">
      <Card>
        <CardHeader>
          <CardTitle id={HEADING_ID}>Necesita hoy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === 'loading' && <Skeleton className="h-40 w-full" />}
          {state === 'error' && (
            <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
          )}
          {state === 'ready' && items.length === 0 && (
            <EmptyState
              title="Sin necesidades activas"
              description="Esta organización no tiene necesidades publicadas por ahora."
            />
          )}
          {state === 'ready' && items.length > 0 && (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {items.map((need) => (
                  <NeedCard key={need.id} need={need} />
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

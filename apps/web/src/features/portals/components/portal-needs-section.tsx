import { useEffect, useState } from 'react';
import type { ResourceNeedPublic } from '@adoptafacil/contracts';
import { Button, Skeleton } from '@adoptafacil/ui';
import { listPublicNeeds } from '../../resources/api/public-resources';
import { NeedCard } from '../../resources/components/need-card';
import styles from '../styles/public-catalog.module.scss';

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
 *
 * Rediseño "editorial" T-D06: mismo criterio que `PortalProductsSection` —
 * sin `Card` envolvente, estado vacío de una sola línea.
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
    <section aria-labelledby={HEADING_ID} data-testid="portal-needs-section" className="space-y-3">
      <h2 id={HEADING_ID} className={styles.heading}>
        Necesita hoy
      </h2>
      {state === 'loading' && <Skeleton className="h-40 w-full" />}
      {state === 'error' && (
        <p className="text-sm text-muted-foreground">
          <span className="block font-medium text-foreground">No se pudo cargar</span>
          Inténtalo de nuevo más tarde.
        </p>
      )}
      {state === 'ready' && items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Esta organización no tiene necesidades publicadas por ahora.
        </p>
      )}
      {state === 'ready' && items.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((need) => (
              <NeedCard key={need.id} need={need} />
            ))}
          </div>
          {items.length < total && (
            <Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? 'Cargando…' : 'Cargar más'}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

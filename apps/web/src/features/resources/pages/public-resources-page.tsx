import { useEffect, useState } from 'react';
import type { ResourceNeedPublic } from '@adoptafacil/contracts';
import { EmptyState, Skeleton } from '@adoptafacil/ui';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { listPublicNeeds } from '../api/public-resources';
import { NeedCard } from '../components/need-card';

type ListState = 'loading' | 'ready' | 'error';
const PAGE_SIZE = 24;

/**
 * Catálogo PÚBLICO del banco de recursos (M09, F-6) en `/recursos`. Sin
 * autenticación: lista las necesidades que aún aceptan ayuda desde
 * `GET /public/resources/needs` (envuelto; `.items` ya normalizado a `[]`).
 * Ofrecer ayuda requiere sesión (ver `OfferResourcePage`), pero navegar y ver
 * las necesidades no.
 */
export function PublicResourcesPage() {
  const [items, setItems] = useState<ResourceNeedPublic[]>([]);
  const [state, setState] = useState<ListState>('loading');

  useEffect(() => {
    let active = true;
    setState('loading');
    listPublicNeeds({ limit: PAGE_SIZE, offset: 0 })
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setState('ready');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicNavbar />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
        <header className="mb-8 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Banco de recursos</h1>
          <p className="text-sm text-muted-foreground">
            Necesidades activas de las organizaciones de rescate — ofrece donaciones físicas.
          </p>
        </header>

        {state === 'loading' && <Skeleton className="h-64 w-full" />}
        {state === 'error' && (
          <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
        )}
        {state === 'ready' && items.length === 0 && (
          <EmptyState
            title="Sin necesidades activas"
            description="No hay necesidades publicadas ahora. Vuelve pronto."
          />
        )}
        {state === 'ready' && items.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((need) => (
              <NeedCard key={need.id} need={need} />
            ))}
          </div>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}

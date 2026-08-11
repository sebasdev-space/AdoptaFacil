import { useEffect, useState } from 'react';
import type { CampaignPublic } from '@adoptafacil/contracts';
import { EmptyState, Skeleton } from '@adoptafacil/ui';
import { PublicFooter, PublicNavbar } from '../../../shell/layout';
import { listPublicCampaigns } from '../api/public-campaigns';
import { CampaignCard } from '../components/campaign-card';

type ListState = 'loading' | 'ready' | 'error';
const PAGE_SIZE = 24;

/**
 * Portal PÚBLICO de campañas (§M14/M06, RF15) en `/campanas`. Sin autenticación
 * (patrón T-052): lista las campañas ACTIVAS que expone `GET /public/campaigns`
 * (envuelto; `.items` ya normalizado a `[]`). Estado vacío explícito; el avance se
 * muestra tal cual lo da el backend (hoy 0). NO es la pantalla de gestión interna
 * (esa es autenticada y vive aparte).
 */
export function PublicCampaignsPage() {
  const [items, setItems] = useState<CampaignPublic[]>([]);
  const [state, setState] = useState<ListState>('loading');

  useEffect(() => {
    let active = true;
    setState('loading');
    listPublicCampaigns({ limit: PAGE_SIZE, offset: 0 })
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
          <h1 className="text-2xl font-bold tracking-tight">Campañas de recaudación</h1>
          <p className="text-sm text-muted-foreground">
            Apoya las campañas activas de las organizaciones de rescate.
          </p>
        </header>

        {state === 'loading' && <Skeleton className="h-64 w-full" />}
        {state === 'error' && (
          <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
        )}
        {state === 'ready' && items.length === 0 && (
          <EmptyState
            title="Sin campañas activas"
            description="No hay campañas activas ahora. Vuelve pronto."
          />
        )}
        {state === 'ready' && items.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </div>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}

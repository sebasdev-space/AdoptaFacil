import { useEffect, useState } from 'react';
import type { CampaignPublic } from '@adoptafacil/contracts';
import { Card, CardContent, CardHeader, CardTitle, EmptyState, Skeleton } from '@adoptafacil/ui';
import { fetchPublicOrgCampaigns } from '../api/public-campaigns';
import { CampaignCard } from '../../campaigns/components/campaign-card';

const PAGE_SIZE = 12;
const HEADING_ID = 'portal-section-campaigns';

type SectionState = 'loading' | 'ready' | 'error';

export interface PortalCampaignsSectionProps {
  slug: string;
}

/**
 * Sección "Campaña activa" del portal público (§M14/M06, F-CAMPANAS-PORTAL-2 —
 * cierra el placeholder `activeCampaign` de `portal-view.ts` ahora que
 * @sebastian publicó `GET /public/organizations/:slug/campaigns`, S2-07).
 * Mismo patrón EXACTO que `PortalAdoptionSection` (mascotas): fetch por slug,
 * `.items` ya normalizado a `[]` (blindaje T-028c), estado vacío explícito en
 * vez de una sección rota u oculta. Reutiliza `CampaignCard` TAL CUAL —el
 * mismo componente del portafolio público general (`/campanas`)— para no
 * duplicar la tarjeta ni divergir visualmente; su enlace ya apunta al detalle
 * público de la campaña.
 *
 * `CampaignPublic` no expone un campo de imagen (ni lo usa `CampaignCard` en
 * el portafolio general) — se muestra título, categoría, organización, avance
 * (meta/recaudado) y vencimiento, que es exactamente lo que el contrato trae.
 */
export function PortalCampaignsSection({ slug }: PortalCampaignsSectionProps) {
  const [items, setItems] = useState<CampaignPublic[]>([]);
  const [state, setState] = useState<SectionState>('loading');

  useEffect(() => {
    let active = true;
    setState('loading');
    fetchPublicOrgCampaigns({ slug, limit: PAGE_SIZE, offset: 0 })
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
  }, [slug]);

  return (
    <section aria-labelledby={HEADING_ID} data-testid="portal-campaigns-section">
      <Card>
        <CardHeader>
          <CardTitle id={HEADING_ID}>Campaña activa</CardTitle>
        </CardHeader>
        <CardContent>
          {state === 'loading' && <Skeleton className="h-40 w-full" />}
          {state === 'error' && (
            <EmptyState title="No se pudo cargar" description="Inténtalo de nuevo más tarde." />
          )}
          {state === 'ready' && items.length === 0 && (
            <EmptyState
              title="Sin campañas activas"
              description="Esta organización no tiene una campaña de recaudación activa por ahora."
            />
          )}
          {state === 'ready' && items.length > 0 && (
            // Lista de una sola columna (3ra iteración del pulido visual):
            // esta sección vive en el panel lateral angosto del portal
            // público, no en un catálogo ancho — un grid de 2-3 columnas
            // pensado para viewport ancho dejaba cada tarjeta apachurrada
            // con espacio muerto al lado. Cada campaña ocupa el ancho
            // completo del panel.
            <div className="flex flex-col gap-3">
              {items.map((campaign) => (
                <CampaignCard key={campaign.id} campaign={campaign} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

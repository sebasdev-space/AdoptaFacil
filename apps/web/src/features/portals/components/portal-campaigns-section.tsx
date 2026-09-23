import { useEffect, useState } from 'react';
import type { CampaignPublic } from '@adoptafacil/contracts';
import { Skeleton } from '@adoptafacil/ui';
import { fetchPublicOrgCampaigns } from '../api/public-campaigns';
import { CampaignCard } from '../../campaigns/components/campaign-card';
import styles from '../styles/public-catalog.module.scss';

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
 *
 * Rediseño "editorial" T-D06: sin `Card` envolvente — heading plano +
 * contenido, compacto (vive en el panel lateral angosto).
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
    <section
      aria-labelledby={HEADING_ID}
      data-testid="portal-campaigns-section"
      className="space-y-3"
    >
      <h2 id={HEADING_ID} className={styles.heading} style={{ fontSize: 'var(--fs-h3)' }}>
        Campaña activa
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
          Esta organización no tiene una campaña de recaudación activa por ahora.
        </p>
      )}
      {state === 'ready' && items.length > 0 && (
        // Lista de una sola columna: esta sección vive en el panel lateral
        // angosto del portal público. Cada campaña ocupa el ancho completo.
        <div className="flex flex-col gap-3">
          {items.map((campaign) => (
            <CampaignCard key={campaign.id} campaign={campaign} />
          ))}
        </div>
      )}
    </section>
  );
}

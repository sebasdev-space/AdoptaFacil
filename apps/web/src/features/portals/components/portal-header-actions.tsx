import { Button } from '@adoptafacil/ui';
import type { OrganizationPublic } from '@adoptafacil/contracts';
import { PortalDonateCta } from './portal-donate-cta';

export interface PortalHeaderActionsProps {
  organization: Pick<OrganizationPublic, 'id' | 'name' | 'logoUrl' | 'nit' | 'location'>;
  onBrowseCatalog: () => void;
}

/**
 * Fila de acciones principales del portal público, reubicada arriba (pulido
 * visual — imagen de referencia usada solo como guía). "Donar" reutiliza
 * `PortalDonateCta` TAL CUAL (misma ruta/query params, `buildDonateHref`) —
 * solo cambia de posición. "Adoptar"/"Apadrinar" NO son acciones de un solo
 * clic a nivel de organización: cada animal tiene su propio flujo
 * ("Solicitar adopción"/"Apadrinar" en su detalle, ver
 * `public-animal-detail-page.tsx`) — no existe hoy un plan de apadrinamiento
 * ni una solicitud de adopción "genérica" sin elegir animal primero. En vez
 * de inventar ese flujo, estos botones llevan al catálogo (tab "Portafolio",
 * §5.1) donde el visitante elige el animal y continúa por la ruta real que
 * ya existe.
 *
 * TODO(client): si el negocio define una acción de apadrinamiento/adopción
 * a nivel de organización (sin animal puntual), estos botones podrían
 * apuntar directo a ella en vez de solo desplazar al catálogo.
 */
export function PortalHeaderActions({ organization, onBrowseCatalog }: PortalHeaderActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="portal-header-actions">
      <PortalDonateCta organization={organization} />
      <Button type="button" variant="outline" size="lg" onClick={onBrowseCatalog}>
        Adoptar
      </Button>
      <Button
        type="button"
        variant="outline"
        size="lg"
        style={{
          backgroundColor: 'hsl(var(--accent))',
          color: 'hsl(var(--accent-foreground))',
          borderColor: 'hsl(var(--accent))',
        }}
        onClick={onBrowseCatalog}
      >
        Apadrinar
      </Button>
    </div>
  );
}

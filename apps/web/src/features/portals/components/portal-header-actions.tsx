import { Link } from 'react-router-dom';
import { Button, buttonVariants, cn } from '@adoptafacil/ui';
import type { OrganizationPublic } from '@adoptafacil/contracts';
import { buildDonateHref } from './portal-donate-cta';

export interface PortalHeaderActionsProps {
  organization: Pick<OrganizationPublic, 'id' | 'name' | 'logoUrl' | 'nit' | 'location'>;
  onBrowseCatalog: () => void;
}

/**
 * Fila de acciones principales del portal público, junto al bloque de
 * nombre/badges (pulido visual, 2da iteración — la 1ra dejó una barra ancha
 * suelta con espacio muerto). Un solo grupo coherente: misma altura (`lg`),
 * "Donar" primario (relleno, color de marca real vía `--primary`), "Adoptar"/
 * "Apadrinar" secundarios (outline).
 *
 * "Donar" reutiliza `buildDonateHref` TAL CUAL (misma ruta/query params que
 * `PortalDonateCta`, sin duplicar esa lógica) — solo se renderiza aquí sin el
 * párrafo de confianza para no romper la alineación con los otros dos
 * botones (ese texto se muestra debajo del GRUPO completo, no por-botón).
 *
 * "Adoptar"/"Apadrinar" NO son acciones de un solo clic a nivel de
 * organización: cada animal tiene su propio flujo ("Solicitar adopción"/
 * "Apadrinar" en su detalle, ver `public-animal-detail-page.tsx`) — no existe
 * hoy un plan "genérico" sin elegir animal primero. En vez de inventar ese
 * flujo, estos botones llevan al catálogo (tab "Portafolio").
 *
 * TODO(client): si el negocio define una acción de apadrinamiento/adopción
 * a nivel de organización (sin animal puntual), estos botones podrían
 * apuntar directo a ella en vez de solo desplazar al catálogo.
 */
export function PortalHeaderActions({ organization, onBrowseCatalog }: PortalHeaderActionsProps) {
  return (
    <div data-testid="portal-header-actions">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to={buildDonateHref(organization)}
          className={cn(buttonVariants({ size: 'lg' }))}
          data-testid="portal-donate-cta"
        >
          Donar
        </Link>
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
      <p className="mt-1.5 text-xs text-muted-foreground">
        Tu aporte es transparente: verás el desglose completo antes de pagar.
      </p>
    </div>
  );
}

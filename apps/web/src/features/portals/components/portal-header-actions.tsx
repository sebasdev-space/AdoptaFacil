import { Link } from 'react-router-dom';
import { cn } from '@adoptafacil/ui';
import type { OrganizationPublic } from '@adoptafacil/contracts';
import { buildDonateHref } from './portal-donate-cta';
import styles from '../styles/public-portal.module.scss';

export interface PortalHeaderActionsProps {
  organization: Pick<OrganizationPublic, 'id' | 'name' | 'logoUrl' | 'nit' | 'location'>;
  onBrowseCatalog: () => void;
}

/**
 * Fila de acciones principales del hero (rediseño "editorial" T-D06):
 * jerarquía clara — "Adoptar" es el único botón sólido (color de marca),
 * "Apadrinar"/"Donar" son botones claros con borde sutil. Antes eran tres
 * bloques ícono+leyenda de igual peso visual; el feedback directo pidió
 * quitar esa decoración y dejar botones simples con jerarquía real.
 *
 * "Donar" reutiliza `buildDonateHref` TAL CUAL (misma ruta/query params que
 * `PortalDonateCta`, sin duplicar esa lógica).
 *
 * "Adoptar"/"Apadrinar" NO son acciones de un solo clic a nivel de
 * organización: cada animal tiene su propio flujo ("Solicitar adopción"/
 * "Apadrinar" en su detalle, ver `public-animal-detail-page.tsx`) — no existe
 * hoy un plan "genérico" sin elegir animal primero. En vez de inventar ese
 * flujo, estos botones desplazan a la sección "Mascotas en adopción".
 *
 * TODO(client): si el negocio define una acción de apadrinamiento/adopción
 * a nivel de organización (sin animal puntual), estos botones podrían
 * apuntar directo a ella en vez de solo desplazar al catálogo.
 */
export function PortalHeaderActions({ organization, onBrowseCatalog }: PortalHeaderActionsProps) {
  return (
    <div data-testid="portal-header-actions" className="flex flex-wrap items-center gap-2.5">
      <button
        type="button"
        className={cn(styles.btn, styles['btn--sm'], styles['btn--primary'])}
        onClick={onBrowseCatalog}
      >
        Adoptar
      </button>
      <button
        type="button"
        className={cn(styles.btn, styles['btn--sm'], styles['btn--outline'])}
        onClick={onBrowseCatalog}
      >
        Apadrinar
      </button>
      <Link
        to={buildDonateHref(organization)}
        className={cn(styles.btn, styles['btn--sm'], styles['btn--outline'])}
        data-testid="portal-donate-cta"
      >
        Donar
      </Link>
      <p className="w-full text-xs text-muted-foreground">
        Tu aporte es transparente: verás el desglose completo antes de pagar.
      </p>
    </div>
  );
}

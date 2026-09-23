import { Link } from 'react-router-dom';
import { cn } from '@adoptafacil/ui';
import type { OrganizationPublic } from '@adoptafacil/contracts';
import { buildDonateHref } from './portal-donate-cta';
import { IconGift, IconHeart, IconHome } from './portal-icons';
import styles from '../styles/public-portal.module.scss';

export interface PortalHeaderActionsProps {
  organization: Pick<OrganizationPublic, 'id' | 'name' | 'logoUrl' | 'nit' | 'location'>;
  onBrowseCatalog: () => void;
}

/**
 * Fila de acciones principales del portal público (rediseño T-D04): tres
 * ítems ícono+leyenda (Adoptar/Apadrinar/Donar) en el hero, no botones
 * sueltos. Cada control fija su `aria-label`/nombre accesible explícito
 * ("Adoptar"/"Apadrinar"/"Donar") porque el texto visible incluye una
 * leyenda descriptiva adicional (p. ej. "Cambia una vida") que NO debe
 * formar parte del nombre accesible.
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
    <div data-testid="portal-header-actions">
      <div className={styles.heroActions}>
        <button
          type="button"
          className={cn(styles.heroAction)}
          onClick={onBrowseCatalog}
          aria-label="Adoptar"
        >
          <span aria-hidden className={styles.heroAction__icon}>
            <IconHome className="h-5 w-5" />
          </span>
          <span aria-hidden>
            <span className={styles.heroAction__label}>Adoptar</span>
            <br />
            <span className={styles.heroAction__caption}>Cambia una vida</span>
          </span>
        </button>

        <button
          type="button"
          className={cn(styles.heroAction)}
          onClick={onBrowseCatalog}
          aria-label="Apadrinar"
        >
          <span aria-hidden className={styles.heroAction__icon}>
            <IconHeart className="h-5 w-5" />
          </span>
          <span aria-hidden>
            <span className={styles.heroAction__label}>Apadrinar</span>
            <br />
            <span className={styles.heroAction__caption}>Acompaña su historia</span>
          </span>
        </button>

        <Link
          to={buildDonateHref(organization)}
          className={cn(styles.heroAction)}
          data-testid="portal-donate-cta"
          aria-label="Donar"
        >
          <span aria-hidden className={styles.heroAction__icon}>
            <IconGift className="h-5 w-5" />
          </span>
          <span aria-hidden>
            <span className={styles.heroAction__label}>Donar</span>
            <br />
            <span className={styles.heroAction__caption}>Ayúdanos a seguir</span>
          </span>
        </Link>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Tu aporte es transparente: verás el desglose completo antes de pagar.
      </p>
    </div>
  );
}

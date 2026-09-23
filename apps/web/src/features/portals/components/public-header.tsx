import type { OrganizationPublic } from '@adoptafacil/contracts';
import { cn } from '@adoptafacil/ui';
import { IconGift, IconPaw, IconSearch } from './portal-icons';
import { buildDonateHref } from './portal-donate-cta';
import styles from '../styles/public-portal.module.scss';

export interface PublicHeaderNavItem {
  label: string;
  href: string;
}

export interface PublicHeaderProps {
  organization: Pick<OrganizationPublic, 'id' | 'name' | 'logoUrl' | 'nit' | 'location'>;
  navItems: readonly PublicHeaderNavItem[];
}

/**
 * Barra de navegación del portal público (§M14, rediseño T-D04). Reemplaza el
 * viejo layout de tabs por una página de scroll continuo con anclas reales —
 * cada `navItems` entry apunta a una sección que YA existe en la página (nunca
 * a contenido inventado): el llamador (`OrgPublicPage`) arma la lista
 * incluyendo solo las secciones que de verdad tienen contenido.
 *
 * El logo/nombre aquí son SOLO decorativos (`alt=""`, sin badge de tipo): la
 * identidad completa y accesible (logo real con su `alt`, badges, nombre
 * como `<h1>`) sigue viviendo únicamente en `PortalProfileSection` — no se
 * duplica aquí para no crear dos elementos con el mismo texto/alt accesible
 * en la misma página.
 *
 * "Quiero ayudar" reutiliza `buildDonateHref` TAL CUAL (misma ruta/query que
 * `PortalDonateCta`/`PortalHeaderActions`, sin duplicar esa lógica).
 */
export function PublicHeader({ organization, navItems }: PublicHeaderProps) {
  return (
    <header className={styles.header} data-testid="public-header">
      <div
        className={cn(
          styles.header__inner,
          'mx-auto w-full px-4 sm:px-6 lg:w-[94vw] lg:max-w-[1500px] lg:px-0',
        )}
      >
        <a href="#portal-top" className={styles.header__brand}>
          {organization.logoUrl ? (
            <img src={organization.logoUrl} alt="" className={styles.header__logo} />
          ) : (
            <span aria-hidden className={styles.header__logoFallback}>
              <IconPaw className="h-4 w-4" />
            </span>
          )}
          <span className={styles.header__name}>{organization.name}</span>
        </a>

        <nav className={styles.header__nav} aria-label="Navegación del portal">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                styles.header__navLink,
                item.href === '#portal-section-pets' && styles['header__navLink--active'],
              )}
            >
              {item.href === '#portal-section-pets' && (
                <IconPaw aria-hidden className="mr-1.5 inline h-3.5 w-3.5" />
              )}
              {item.label}
            </a>
          ))}
        </nav>

        <div className={styles.header__actions}>
          <a
            href={buildDonateHref(organization)}
            className={cn(styles.btn, styles['btn--sm'], styles['btn--primary'])}
            data-testid="public-header-donate"
          >
            <IconGift className="mr-1.5 h-4 w-4" />
            Quiero ayudar
          </a>
          <a
            href="#portal-section-pets"
            className={styles.header__iconButton}
            aria-label="Buscar animales"
          >
            <IconSearch className="h-4 w-4" />
          </a>
        </div>
      </div>
    </header>
  );
}

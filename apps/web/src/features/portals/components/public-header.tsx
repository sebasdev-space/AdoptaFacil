import { useEffect, useRef, useState } from 'react';
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

/** Distancia (px) bajo el borde superior a la que una sección cuenta como "la actual". */
const ACTIVE_SECTION_OFFSET = 140;

/**
 * Scroll-spy: devuelve el `href` de la sección que el visitante está viendo —
 * la última cuyo borde superior ya pasó la línea bajo la barra fija (no depende
 * del orden de la lista, solo de la posición real en la página). Mientras el
 * visitante está arriba del todo, gana el primer ítem ("Inicio").
 *
 * Dos casos que el cálculo por posición NO resuelve solo:
 * - Una sección cercana al final (p. ej. "Transparencia" con "Contacto" debajo)
 *   nunca llega a la línea de referencia porque la página ya no da más scroll.
 *   Por eso un CLIC en el menú fija esa pestaña ("bloqueo") y el scroll-spy se
 *   ignora hasta que el visitante vuelve a desplazarse él mismo (rueda, touch o
 *   teclado) — el scroll programático del ancla no cuenta.
 * - Al llegar al final de la página sin haber hecho clic: se conserva la pestaña
 *   actual si su sección sigue a la vista; si no, gana la última de la lista.
 */
function useActiveSection(hrefs: readonly string[]): [string | undefined, (href: string) => void] {
  const [active, setActive] = useState<string | undefined>(hrefs[0]);
  const activeRef = useRef<string | undefined>(hrefs[0]);
  const lockedRef = useRef(false);
  const key = hrefs.join('|');

  const apply = (href: string | undefined) => {
    activeRef.current = href;
    setActive(href);
  };

  useEffect(() => {
    const ids = key.split('|').filter(Boolean);
    const find = (id: string) => document.getElementById(id.replace(/^#/, ''));
    let frame = 0;
    const compute = () => {
      frame = 0;
      if (lockedRef.current) return;
      let best: { id: string; top: number } | undefined;
      for (const id of ids) {
        const element = find(id);
        if (!element) continue;
        const top = element.getBoundingClientRect().top;
        if (top <= ACTIVE_SECTION_OFFSET && (!best || top > best.top)) best = { id, top };
      }
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom && window.scrollY > 0) {
        const current = activeRef.current ? find(activeRef.current) : null;
        const currentInView = current && current.getBoundingClientRect().top < window.innerHeight;
        if (currentInView && activeRef.current) {
          best = { id: activeRef.current, top: 0 };
        } else {
          const last = [...ids].reverse().find((id) => find(id));
          if (last) best = { id: last, top: 0 };
        }
      }
      apply(best?.id ?? ids[0]);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(compute);
    };
    // Desplazamiento iniciado por el visitante: libera el bloqueo del clic.
    const onUserScroll = () => {
      lockedRef.current = false;
    };
    compute();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('wheel', onUserScroll, { passive: true });
    window.addEventListener('touchmove', onUserScroll, { passive: true });
    window.addEventListener('keydown', onUserScroll);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('wheel', onUserScroll);
      window.removeEventListener('touchmove', onUserScroll);
      window.removeEventListener('keydown', onUserScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [key]);

  const select = (href: string) => {
    lockedRef.current = true;
    apply(href);
  };

  return [active, select];
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
  const [activeHref, setActiveHref] = useActiveSection(navItems.map((item) => item.href));

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
                item.href === activeHref && styles['header__navLink--active'],
              )}
              aria-current={item.href === activeHref ? 'location' : undefined}
              onClick={() => setActiveHref(item.href)}
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

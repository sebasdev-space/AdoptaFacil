import { Button } from '@adoptafacil/ui';
import { MenuIcon, LogOutIcon } from '../icons';
import { useNav } from '../navigation/nav-context';
import { useSession } from '../auth';
import { TransparencyIndicator } from '../transparency';
import { Brand } from './brand';
import styles from './header.module.scss';

/**
 * Shell header, present on every module. Left: the drawer toggle (< lg) / brand
 * on móvil. Center–right: the persistent transparency indicator (§M14) and
 * session actions. BEM+SCSS (REFACTOR-VISUAL v2, Fase 3).
 */
export function Header() {
  const { toggleDrawer } = useNav();
  const { user, signOut } = useSession();

  const initials = user?.name
    ?.split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');

  return (
    <header className={styles.topbar}>
      {/* Drawer toggle — móvil/tablet only */}
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleDrawer}
        aria-label="Abrir menú de navegación"
        className="px-2 lg:hidden"
      >
        <MenuIcon className="h-5 w-5" />
      </Button>

      {/* Brand on móvil/tablet (the sidebar carries it on escritorio) */}
      <Brand className="lg:hidden" />

      {/* Persistent transparency indicator (§M14) */}
      <div className={styles.topbar__actions}>
        <TransparencyIndicator />

        {user && (
          <div className={styles.topbar__user}>
            <span className={styles.topbar__avatar} aria-hidden>
              {initials}
            </span>
            <span className={styles['topbar__user-name']} title={user.email}>
              {user.name}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              aria-label="Cerrar sesión"
              className="px-2"
            >
              <LogOutIcon className="h-5 w-5" />
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}

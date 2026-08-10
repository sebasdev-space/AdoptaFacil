import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Button, Skeleton, cn } from '@adoptafacil/ui';
import { CloseIcon } from '../icons';
import { navItems } from '../navigation';
import { useNav } from '../navigation/nav-context';
import { useSession } from '../auth';
import { Brand } from './brand';
import { useOrgIdentity } from './use-org-identity';
import styles from './sidebar.module.scss';

/**
 * The navigation link list, shared by the persistent sidebar and the drawer.
 *
 * Role-gated entries are filtered out unless the session `hasAnyRole(...roles)`
 * — the FIRST barrier of the double-barrier UX (the route's <RequireRoles> is
 * the second). Deny-by-default: entries with no roles show for everyone; entries
 * with roles stay hidden while roles are absent (e.g. a degraded roles fetch).
 *
 * F1-01: `personaOnly` entries additionally require `accountType === 'person'`
 * — an allow-list of roles can't express "has none of these", so this checks
 * the account kind directly instead (see `NavItem.personaOnly`).
 */
function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { hasAnyRole, user } = useSession();
  const items = navItems.filter(
    (item) =>
      (!item.roles || hasAnyRole(...item.roles)) &&
      (!item.personaOnly || user?.accountType === 'person'),
  );

  return (
    <nav aria-label="Navegación principal" className={styles['org-sidebar__nav']}>
      {items.map(({ path, label, icon: Icon, end }) => (
        <NavLink
          key={path}
          to={path}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(styles['org-sidebar__link'], isActive && styles['org-sidebar__link--active'])
          }
        >
          <Icon />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

/** Real org name (never a placeholder) — hidden entirely for a Persona session. */
function SidebarIdentity() {
  const identity = useOrgIdentity();

  if (identity.status === 'idle') return null;

  if (identity.status === 'loading') {
    return (
      <div className={styles['org-sidebar__identity']}>
        <Skeleton className="h-9 w-9 rounded-md" />
        <Skeleton className="h-4 w-28" />
      </div>
    );
  }

  if (identity.status === 'error') return null;

  const initials = identity.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');

  return (
    <div className={styles['org-sidebar__identity']}>
      <span className={styles['org-sidebar__identity-avatar']} aria-hidden>
        {initials}
      </span>
      <span className={styles['org-sidebar__identity-name']}>{identity.name}</span>
    </div>
  );
}

function SidebarFooter() {
  const { user } = useSession();
  return (
    <div className={styles['org-sidebar__footer']}>
      {user ? (
        <span className={styles['org-sidebar__footer-name']}>{user.name}</span>
      ) : (
        <span>AdoptaFácil</span>
      )}
    </div>
  );
}

/** Persistent sidebar shown from `lg` up (escritorio) — navy surface, real logo/org identity (REFACTOR-VISUAL v2, Fase 3). */
export function Sidebar() {
  return (
    <aside className={styles['org-sidebar']} data-testid="org-sidebar">
      <div className={styles['org-sidebar__brand']}>
        <Brand inverse />
      </div>
      <SidebarIdentity />
      <SidebarNav />
      <SidebarFooter />
    </aside>
  );
}

/**
 * Off-canvas navigation drawer for móvil/tablet (< lg). Open/close state lives in
 * NavContext; it closes on Escape and on backdrop click. Navigation itself closes
 * it via the layout (which reacts to route changes).
 */
export function MobileNavDrawer() {
  const { isDrawerOpen, closeDrawer } = useNav();

  useEffect(() => {
    if (!isDrawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDrawer();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isDrawerOpen, closeDrawer]);

  return (
    <div
      className={cn('lg:hidden', isDrawerOpen ? 'pointer-events-auto' : 'pointer-events-none')}
      aria-hidden={!isDrawerOpen}
    >
      <div
        className={cn(styles['mobile-drawer-backdrop'], isDrawerOpen ? 'opacity-100' : 'opacity-0')}
        onClick={closeDrawer}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menú de navegación"
        className={cn(
          styles['mobile-drawer-panel'],
          isDrawerOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className={cn(styles['org-sidebar__brand'], styles['org-sidebar__brand--split'])}>
          <Brand inverse />
          <Button
            variant="ghost"
            size="sm"
            onClick={closeDrawer}
            aria-label="Cerrar menú"
            className="px-2 text-white hover:bg-white/10 hover:text-white"
          >
            <CloseIcon className="h-5 w-5" />
          </Button>
        </div>
        <SidebarIdentity />
        <SidebarNav onNavigate={closeDrawer} />
        <SidebarFooter />
      </div>
    </div>
  );
}

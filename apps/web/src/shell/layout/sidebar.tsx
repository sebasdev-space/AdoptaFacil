import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Button, cn } from '@adoptafacil/ui';
import { CloseIcon } from '../icons';
import { navItems } from '../navigation';
import { useNav } from '../navigation/nav-context';
import { useSession } from '../auth';
import { Brand } from './brand';

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
    <nav aria-label="Navegación principal" className="flex-1 space-y-1 px-3 py-4">
      {items.map(({ path, label, icon: Icon, end }) => (
        <NavLink
          key={path}
          to={path}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-white/70 hover:bg-white/10 hover:text-white',
            )
          }
        >
          <Icon className="h-5 w-5 shrink-0" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function SidebarFooter() {
  return (
    <div className="border-t border-white/10 px-4 py-3 text-xs text-white/50">
      <p>AdoptaFácil V2.0</p>
      <p className="mt-0.5">Portal con transparencia</p>
    </div>
  );
}

/** Persistent sidebar shown from `lg` up (escritorio). REFACTOR-VISUAL Fase B:
 * solid navy fill matching the brand mockup's organization-mode sidebar. */
export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-navy lg:flex">
      <div className="flex h-16 items-center border-b border-white/10 px-4">
        <Brand inverse />
      </div>
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
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-foreground/40 transition-opacity duration-200',
          isDrawerOpen ? 'opacity-100' : 'opacity-0',
        )}
        onClick={closeDrawer}
      />

      {/* Drawer panel — same navy surface as the persistent sidebar (Fase B). */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menú de navegación"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-navy shadow-xl transition-transform duration-200 ease-out',
          isDrawerOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
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
        <SidebarNav onNavigate={closeDrawer} />
        <SidebarFooter />
      </div>
    </div>
  );
}

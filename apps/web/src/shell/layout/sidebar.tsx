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
 */
function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { hasAnyRole } = useSession();
  const items = navItems.filter((item) => !item.roles || hasAnyRole(...item.roles));

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
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground',
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
    <div className="border-t px-4 py-3 text-xs text-muted-foreground">
      <p>AdoptaFácil V2.0</p>
      <p className="mt-0.5">Portal con transparencia · §M14</p>
    </div>
  );
}

/** Persistent sidebar shown from `lg` up (escritorio). */
export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r bg-card lg:flex">
      <div className="flex h-16 items-center border-b px-4">
        <Brand />
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

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menú de navegación"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-card shadow-xl transition-transform duration-200 ease-out',
          isDrawerOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between border-b px-4">
          <Brand />
          <Button
            variant="ghost"
            size="sm"
            onClick={closeDrawer}
            aria-label="Cerrar menú"
            className="px-2"
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

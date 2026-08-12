import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Button, Skeleton, cn } from '@adoptafacil/ui';
import { ChevronDownIcon, CloseIcon } from '../icons';
import { navItems, ORG_MEMBER_ROLES, type NavItem } from '../navigation';
import { useNav } from '../navigation/nav-context';
import { useSession } from '../auth';
import { Brand } from './brand';
import { useOrgIdentity } from './use-org-identity';
import styles from './sidebar.module.scss';

/** Shared visibility check for a leaf entry (top-level or inside a group). */
function useLeafVisibility() {
  const { hasAnyRole, user } = useSession();
  return (leaf: Pick<NavItem, 'roles' | 'personaOnly'>) =>
    (!leaf.roles || hasAnyRole(...leaf.roles)) &&
    (!leaf.personaOnly || user?.accountType === 'person');
}

/**
 * MENU-SUBMENUS: one collapsible group ("Donaciones", "Apadrinamientos",
 * "Documentos"). Each child keeps its OWN `roles`/`personaOnly`/`comingSoon`
 * gate, filtered exactly like a top-level `NavItem` always was — grouping is
 * purely visual, never a permission change.
 *
 * `navigable` groups ("Documentos") render the label as a real link to
 * `item.path` (only when the current session can see the parent's own
 * `roles`) plus a separate chevron button that only toggles expand/collapse.
 * Non-navigable groups ("Donaciones", "Apadrinamientos") render the whole row
 * as a single toggle `button` — there is no page of their own to go to.
 */
function SidebarGroup({
  item,
  childItems,
  onNavigate,
}: {
  item: NavItem;
  childItems: NavItem[];
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const canSeeLeaf = useLeafVisibility();
  const [manualOpen, setManualOpen] = useState<boolean | undefined>(undefined);
  const Icon = item.icon;

  const hasActiveChild = childItems.some((child) => location.pathname === child.path);
  const isOpen = manualOpen ?? hasActiveChild;
  const toggle = () => setManualOpen(!isOpen);
  const canNavigateParent = Boolean(item.navigable) && canSeeLeaf(item);

  const chevronButton = (
    <button
      type="button"
      className={styles['org-sidebar__group-toggle']}
      aria-expanded={isOpen}
      aria-label={`${isOpen ? 'Colapsar' : 'Expandir'} ${item.label}`}
      onClick={toggle}
    >
      <ChevronDownIcon
        className={cn(
          styles['org-sidebar__group-chevron'],
          isOpen && styles['org-sidebar__group-chevron--open'],
        )}
      />
    </button>
  );

  return (
    <div className={styles['org-sidebar__group']}>
      {item.navigable ? (
        <div className={styles['org-sidebar__group-header']}>
          {canNavigateParent ? (
            <NavLink
              to={item.path}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  styles['org-sidebar__link'],
                  styles['org-sidebar__group-link'],
                  isActive && styles['org-sidebar__link--active'],
                )
              }
            >
              <Icon />
              <span>{item.label}</span>
            </NavLink>
          ) : (
            <span
              className={cn(
                styles['org-sidebar__link'],
                styles['org-sidebar__group-link'],
                styles['org-sidebar__group-link--static'],
              )}
            >
              <Icon />
              <span>{item.label}</span>
            </span>
          )}
          {chevronButton}
        </div>
      ) : (
        <div className={styles['org-sidebar__group-header']}>
          <button
            type="button"
            className={cn(styles['org-sidebar__link'], styles['org-sidebar__group-toggle-row'])}
            aria-expanded={isOpen}
            onClick={toggle}
          >
            <Icon />
            <span className={styles['org-sidebar__group-row-label']}>{item.label}</span>
          </button>
          {chevronButton}
        </div>
      )}
      {isOpen && (
        <div className={styles['org-sidebar__group-children']}>
          {childItems.map((child) => (
            <NavLink
              key={child.path}
              to={child.path}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  styles['org-sidebar__link'],
                  styles['org-sidebar__link--child'],
                  isActive && styles['org-sidebar__link--active'],
                )
              }
            >
              <span>{child.label}</span>
              {child.comingSoon && <span className={styles['org-sidebar__badge']}>Pronto</span>}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

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
 *
 * MENU-SUBMENUS: a group entry (`children` present) is kept whenever the
 * parent's OWN gate passes OR at least one child's gate passes — e.g. a role
 * that can't open "Documentos" itself but CAN see its "Pronto" children (see
 * the long comment on that entry in nav-items.ts) still gets the group, just
 * without a working link on the parent label.
 */
function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const canSeeLeaf = useLeafVisibility();

  return (
    <nav aria-label="Navegación principal" className={styles['org-sidebar__nav']}>
      {navItems.map((item) => {
        if (item.children) {
          const visibleChildren = item.children.filter(canSeeLeaf);
          if (!canSeeLeaf(item) && visibleChildren.length === 0) return null;
          return (
            <SidebarGroup
              key={item.path}
              item={item}
              childItems={visibleChildren}
              onNavigate={onNavigate}
            />
          );
        }
        if (!canSeeLeaf(item)) return null;
        const { path, label, icon: Icon, end, comingSoon } = item;
        return (
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
            {comingSoon && <span className={styles['org-sidebar__badge']}>Pronto</span>}
          </NavLink>
        );
      })}
    </nav>
  );
}

/**
 * Real org name (never a placeholder) — hidden entirely for a Persona session.
 *
 * MENU-SUBMENUS: this block replaces the old standalone "Mi organización" nav
 * entry — it now navigates to the SAME route (`/organizacion`) the removed
 * item used to. Gated the same way that entry was (`hasAnyRole(...ORG_MEMBER_ROLES)`,
 * T-062): every real org role satisfies it, so in practice this only ever
 * downgrades to a non-clickable chip if a session somehow has no org role at
 * all — never a behavior change for a normal org member.
 */
function SidebarIdentity({ onNavigate }: { onNavigate?: () => void }) {
  const identity = useOrgIdentity();
  const { hasAnyRole } = useSession();

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

  const content = (
    <>
      {identity.logoUrl ? (
        <img
          src={identity.logoUrl}
          alt={`Logo de ${identity.name}`}
          className={styles['org-sidebar__identity-avatar']}
        />
      ) : (
        <span className={styles['org-sidebar__identity-avatar']} aria-hidden>
          {initials}
        </span>
      )}
      <span className={styles['org-sidebar__identity-text']}>
        <span className={styles['org-sidebar__identity-name']}>{identity.name}</span>
        <span className={styles['org-sidebar__identity-label']}>Organización</span>
      </span>
    </>
  );

  if (!hasAnyRole(...ORG_MEMBER_ROLES)) {
    return <div className={styles['org-sidebar__identity']}>{content}</div>;
  }

  return (
    <NavLink
      to="/organizacion"
      onClick={onNavigate}
      className={cn(styles['org-sidebar__identity'], styles['org-sidebar__identity--link'])}
    >
      {content}
    </NavLink>
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
        <SidebarIdentity onNavigate={closeDrawer} />
        <SidebarNav onNavigate={closeDrawer} />
        <SidebarFooter />
      </div>
    </div>
  );
}

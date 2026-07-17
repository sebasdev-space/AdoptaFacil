import { Button } from '@adoptafacil/ui';
import { ThemeToggle } from '../theme';
import { MenuIcon, LogOutIcon } from '../icons';
import { useNav } from '../navigation/nav-context';
import { useSession } from '../auth';
import { TransparencyIndicator } from '../transparency';
import { Brand } from './brand';

/**
 * Shell header, present on every module. Left: the drawer toggle (< lg) / brand
 * on móvil. Center–right: the persistent transparency indicator (§M14), theme
 * toggle and session actions.
 */
export function Header() {
  const { toggleDrawer } = useNav();
  const { user, signOut } = useSession();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
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
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <TransparencyIndicator />

        <ThemeToggle />

        {user && (
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground md:inline" title={user.email}>
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

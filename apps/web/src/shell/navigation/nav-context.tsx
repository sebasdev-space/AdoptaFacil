import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Navigation UI state for the shell — currently just the mobile/tablet drawer's
 * open/closed state. Held in memory only (no browser storage, per T-021).
 */
interface NavContextValue {
  /** Whether the off-canvas navigation drawer is open (móvil/tablet). */
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
}

const NavContext = createContext<NavContextValue | undefined>(undefined);

export function NavProvider({ children }: { children: ReactNode }) {
  const [isDrawerOpen, setDrawerOpen] = useState(false);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setDrawerOpen((open) => !open), []);

  const value = useMemo<NavContextValue>(
    () => ({ isDrawerOpen, openDrawer, closeDrawer, toggleDrawer }),
    [isDrawerOpen, openDrawer, closeDrawer, toggleDrawer],
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

/** Read/control the navigation drawer. Throws if used outside <NavProvider>. */
export function useNav(): NavContextValue {
  const context = useContext(NavContext);
  if (context === undefined) {
    throw new Error('useNav must be used within a <NavProvider>');
  }
  return context;
}

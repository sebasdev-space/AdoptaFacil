import type { ReactNode } from 'react';
import { SessionProvider, type SessionProviderProps } from './auth';
import { NavProvider } from './navigation';
import { ThemeProvider, type ThemeProviderProps } from './theme';
import {
  SessionTransparencyProvider,
  TransparencyProvider,
  type TransparencyProviderProps,
} from './transparency';

export interface AppProvidersProps {
  children: ReactNode;
  /** Overrides for individual providers (used by tests). */
  theme?: Omit<ThemeProviderProps, 'children'>;
  session?: Omit<SessionProviderProps, 'children'>;
  transparency?: Omit<TransparencyProviderProps, 'children'>;
}

/**
 * Composes every shell-wide context. Order matters only in that all state is
 * in-memory (no browser storage, per T-021); no provider depends on another at
 * mount. Kept router-agnostic so the same tree wraps both <BrowserRouter> (app)
 * and <MemoryRouter> (tests).
 */
export function AppProviders({ children, theme, session, transparency }: AppProvidersProps) {
  // By default the indicator derives from REAL session data (T-029). Tests may
  // still pin an explicit value via the `transparency` prop.
  const nav = <NavProvider>{children}</NavProvider>;
  return (
    <ThemeProvider {...theme}>
      <SessionProvider {...session}>
        {transparency ? (
          <TransparencyProvider {...transparency}>{nav}</TransparencyProvider>
        ) : (
          <SessionTransparencyProvider>{nav}</SessionTransparencyProvider>
        )}
      </SessionProvider>
    </ThemeProvider>
  );
}

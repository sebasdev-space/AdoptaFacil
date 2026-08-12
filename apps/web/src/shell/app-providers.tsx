import type { ReactNode } from 'react';
import { Toaster } from '@adoptafacil/ui';
import { SessionProvider, type SessionProviderProps } from './auth';
import { NavProvider } from './navigation';
import {
  SessionTransparencyProvider,
  TransparencyProvider,
  type TransparencyProviderProps,
} from './transparency';

export interface AppProvidersProps {
  children: ReactNode;
  session?: Omit<SessionProviderProps, 'children'>;
  transparency?: Omit<TransparencyProviderProps, 'children'>;
}

/**
 * Composes every shell-wide context. Order matters only in that all state is
 * in-memory (no browser storage, per T-021); no provider depends on another at
 * mount. Kept router-agnostic so the same tree wraps both <BrowserRouter> (app)
 * and <MemoryRouter> (tests).
 */
export function AppProviders({ children, session, transparency }: AppProvidersProps) {
  // By default the indicator derives from REAL session data (T-029). Tests may
  // still pin an explicit value via the `transparency` prop.
  const nav = <NavProvider>{children}</NavProvider>;
  return (
    <SessionProvider {...session}>
      {transparency ? (
        <TransparencyProvider {...transparency}>{nav}</TransparencyProvider>
      ) : (
        <SessionTransparencyProvider>{nav}</SessionTransparencyProvider>
      )}
      {/* Global toast viewport (T-D05) — every feature's `useToast()`/`toast()`
          call queues into the shared store in packages/ui; this is the ONE place
          in the whole app that actually renders it. Previously missing entirely,
          so no toast anywhere in the app was ever visible despite being fired. */}
      <Toaster />
    </SessionProvider>
  );
}

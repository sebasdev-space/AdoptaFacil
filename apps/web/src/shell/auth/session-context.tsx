import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Session layer of the app shell.
 *
 * This is the **integration point for the real session (T-022)**. Route guards
 * and chrome consume `useSession()` and never assume how the session is sourced.
 * In Ola 0 the provider is a mock that starts authenticated so the shell is
 * navigable; T-022 replaces the body of <SessionProvider> (real auth, token
 * refresh, async resolution) while keeping this context shape — so no route or
 * guard code has to be rewritten.
 *
 * State is in memory only — no browser storage (per T-021).
 */
export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  /** Coarse roles; the real RBAC model arrives with the session in T-022. */
  roles: string[];
}

export interface SessionContextValue {
  status: SessionStatus;
  user: SessionUser | null;
  /** Whether a session is currently established. */
  isAuthenticated: boolean;
  /** Mock sign-in — replaced by the real credential flow in T-022. */
  signIn: (user?: SessionUser) => void;
  signOut: () => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

/** Placeholder identity so the shell renders a realistic header in Ola 0. */
const MOCK_USER: SessionUser = {
  id: 'mock-user',
  name: 'Equipo AdoptaFácil',
  email: 'equipo@adoptafacil.org',
  roles: ['admin'],
};

export interface SessionProviderProps {
  children: ReactNode;
  /**
   * Initial session status. Defaults to 'authenticated' (mock) so the shell is
   * navigable in development. Tests pass 'unauthenticated'/'loading' to exercise
   * the route guard.
   */
  initialStatus?: SessionStatus;
  /** Initial user for the authenticated case (tests may override). */
  initialUser?: SessionUser;
}

export function SessionProvider({
  children,
  initialStatus = 'authenticated',
  initialUser = MOCK_USER,
}: SessionProviderProps) {
  const [status, setStatus] = useState<SessionStatus>(initialStatus);
  const [user, setUser] = useState<SessionUser | null>(
    initialStatus === 'authenticated' ? initialUser : null,
  );

  const signIn = useCallback((nextUser: SessionUser = MOCK_USER) => {
    setUser(nextUser);
    setStatus('authenticated');
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      user,
      isAuthenticated: status === 'authenticated',
      signIn,
      signOut,
    }),
    [status, user, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Read the current session. Throws if used outside <SessionProvider>. */
export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a <SessionProvider>');
  }
  return context;
}

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  ApiClientProvider,
  createShellApi,
  tokensFromContract,
  type AuthApi,
  type AuthUser,
  type LoginRequest,
  type ShellApi,
} from '../api';

/**
 * Session layer of the app shell (T-022).
 *
 * Owns the in-memory session and the API client's lifecycle. Route guards and
 * chrome consume `useSession()` and never see tokens. Sign-in acquires tokens via
 * the typed {@link AuthApi} and stores them in memory; the client's refresh
 * interceptor keeps the access token fresh; sign-out (and any unrecoverable
 * token refresh) clears the session, which makes protected routes redirect.
 *
 * NO browser storage — the session lives only in React state + an in-memory
 * token store. Tokens are never logged.
 */
export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

/** App-facing user shape, decoupled from the auth contract's {@link AuthUser}. */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  roles: string[];
  organizationId?: string;
}

export interface SessionContextValue {
  status: SessionStatus;
  user: SessionUser | null;
  isAuthenticated: boolean;
  /**
   * Establish a session. With credentials, performs the real login; without
   * them, uses a demo login (Ola 0 convenience against the mock auth service).
   */
  signIn: (credentials?: LoginRequest) => Promise<void>;
  /** Tear down the session (clears in-memory tokens; best-effort server logout). */
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

/** Demo credentials for the no-argument sign-in path (mock service only). */
const DEMO_CREDENTIALS: LoginRequest = {
  email: 'demo@adoptafacil.org',
  password: 'demo',
};

/** Placeholder identity for tests that bootstrap an authenticated session. */
const MOCK_USER: SessionUser = {
  id: 'usr_mock_1',
  name: 'Equipo AdoptaFácil',
  email: 'equipo@adoptafacil.org',
  roles: ['admin'],
  organizationId: 'org_mock_1',
};

function toSessionUser(user: AuthUser): SessionUser {
  return {
    id: user.id,
    name: user.displayName,
    email: user.email,
    roles: user.roles,
    organizationId: user.organizationId,
  };
}

export interface SessionProviderProps {
  children: ReactNode;
  /**
   * Initial status. Defaults to 'unauthenticated' — with no persistence a fresh
   * load has no session, so the app starts at the login route. Tests may bootstrap
   * 'authenticated'/'loading' to exercise the guard without a login round-trip.
   */
  initialStatus?: SessionStatus;
  /** Initial user when bootstrapping an authenticated session (tests). */
  initialUser?: SessionUser;
  /** Inject an auth service (real impl, or a fake in tests). Defaults to the mock. */
  authApi?: AuthApi;
  /** Injectable fetch, forwarded to the client (tests). */
  fetchFn?: typeof fetch;
}

export function SessionProvider({
  children,
  initialStatus = 'unauthenticated',
  initialUser = MOCK_USER,
  authApi,
  fetchFn,
}: SessionProviderProps) {
  const [status, setStatus] = useState<SessionStatus>(initialStatus);
  const [user, setUser] = useState<SessionUser | null>(
    initialStatus === 'authenticated' ? initialUser : null,
  );

  // Build the API layer once. `onSessionExpired` fires when a refresh fails or
  // is impossible — dropping the session so protected routes redirect. setState
  // identities are stable, so wiring them here is safe.
  const [api] = useState<ShellApi>(() =>
    createShellApi({
      authApi,
      fetchFn,
      onSessionExpired: () => {
        setUser(null);
        setStatus('unauthenticated');
      },
    }),
  );

  const signIn = useCallback(
    async (credentials?: LoginRequest) => {
      const { user: authUser, tokens } = await api.authApi.login(credentials ?? DEMO_CREDENTIALS);
      api.tokenStore.set(tokensFromContract(tokens));
      setUser(toSessionUser(authUser));
      setStatus('authenticated');
    },
    [api],
  );

  const signOut = useCallback(async () => {
    const refreshToken = api.tokenStore.getRefreshToken();
    // Clear locally first so the UI can't act on a stale session even if the
    // network call hangs or fails.
    api.tokenStore.clear();
    setUser(null);
    setStatus('unauthenticated');
    await api.authApi.logout(refreshToken);
  }, [api]);

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

  return (
    <SessionContext.Provider value={value}>
      <ApiClientProvider client={api.client}>{children}</ApiClientProvider>
    </SessionContext.Provider>
  );
}

/** Read the current session. Throws if used outside <SessionProvider>. */
export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a <SessionProvider>');
  }
  return context;
}

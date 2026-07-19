import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  ApiClientProvider,
  createShellApi,
  tokensFromContract,
  type AuthApi,
  type AuthSession,
  type AuthenticatedUser,
  type ForgotPasswordRequest,
  type LoginRequest,
  type RegisterRequest,
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
  /** Create an account (Organization or Person) and establish its session. */
  register: (request: RegisterRequest) => Promise<void>;
  /** Request a password reset (no session change; resolves generically). */
  requestPasswordReset: (request: ForgotPasswordRequest) => Promise<void>;
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
  roles: [],
  organizationId: 'org_mock_1',
};

/**
 * Map the auth principal to the app-facing session user. Roles are intentionally
 * EMPTY for now: `AuthenticatedUser` no longer carries them, and wiring them from
 * the RBAC endpoint (`GET /rbac/my-roles`, T-012) is deferred to T-025. No UI
 * gates on roles yet, so an empty list is safe until then.
 */
function toSessionUser(user: AuthenticatedUser): SessionUser {
  return {
    id: user.id,
    name: user.displayName,
    email: user.email,
    roles: [],
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
  /**
   * Transport mode forwarded to the API layer: 'http' talks to the real
   * `/auth/*` endpoints, 'mock' uses the in-memory service. Omitted in tests
   * (the API layer then defaults to the mock).
   */
  mode?: 'mock' | 'http';
  /** Injectable fetch, forwarded to the client (tests). */
  fetchFn?: typeof fetch;
}

export function SessionProvider({
  children,
  initialStatus = 'unauthenticated',
  initialUser = MOCK_USER,
  authApi,
  mode,
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
      mode,
      fetchFn,
      onSessionExpired: () => {
        setUser(null);
        setStatus('unauthenticated');
      },
    }),
  );

  // Store tokens in memory and flip the session to authenticated.
  const establish = useCallback(
    (response: AuthSession) => {
      api.tokenStore.set(tokensFromContract(response.tokens));
      setUser(toSessionUser(response.user));
      setStatus('authenticated');
    },
    [api],
  );

  const signIn = useCallback(
    async (credentials?: LoginRequest) => {
      establish(await api.authApi.login(credentials ?? DEMO_CREDENTIALS));
    },
    [api, establish],
  );

  const register = useCallback(
    async (request: RegisterRequest) => {
      establish(await api.authApi.register(request));
    },
    [api, establish],
  );

  const requestPasswordReset = useCallback(
    (request: ForgotPasswordRequest): Promise<void> => api.authApi.requestPasswordReset(request),
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
      register,
      requestPasswordReset,
      signOut,
    }),
    [status, user, signIn, register, requestPasswordReset, signOut],
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

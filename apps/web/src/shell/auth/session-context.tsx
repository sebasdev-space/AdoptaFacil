import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type {
  FormalizationState,
  FormalizationStatus,
  VerificationLevel,
} from '@adoptafacil/contracts';
import {
  ApiClientProvider,
  createShellApi,
  Role,
  tokensFromContract,
  type AccountType,
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

/**
 * Loading state of the RBAC roles WITHIN an authenticated session (T-025):
 *   - 'loading'  → roles are being fetched (during session establishment)
 *   - 'ready'    → roles loaded from `GET /rbac/my-roles`
 *   - 'degraded' → the roles fetch failed; the session stays authenticated but
 *                  with NO authority (roles: []) — deny-by-default — and offers
 *                  a retry without forcing a re-login.
 */
export type RolesStatus = 'loading' | 'ready' | 'degraded';

/** App-facing user shape, decoupled from the auth contract's {@link AuthUser}. */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  /** Real RBAC roles from the contract enum (never loose strings). */
  roles: Role[];
  organizationId?: string;
  /** Account kind — gates org-only features (e.g. the transparency indicator). */
  accountType: AccountType;
}

/**
 * Loading state of the shell transparency source (T-029). Loaded ONCE per
 * session (at establishment or on {@link SessionContextValue.refreshTransparency}),
 * never per render:
 *   - 'idle'    → not applicable (no session, or a non-organization account)
 *   - 'loading' → the org's formalization/verification is being fetched
 *   - 'ready'   → source loaded; the indicator shows REAL derived data
 *   - 'error'   → the fetch failed; the indicator shows an unavailable state
 */
export type TransparencySourceStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Real inputs for the shell transparency indicator, sourced from the `org`
 * contract (T-029). Shape-compatible with `deriveTransparency`'s argument.
 * `accountability` is NOT here: it stays an honest placeholder (M05/M06).
 */
export interface OrgTransparencySource {
  verificationLevel?: VerificationLevel;
  formalizationState?: FormalizationState;
}

export interface SessionContextValue {
  status: SessionStatus;
  user: SessionUser | null;
  isAuthenticated: boolean;
  /**
   * Loading state of the session's RBAC roles. 'degraded' means the roles fetch
   * failed and the user currently has no authority (deny-by-default); call
   * {@link retryRoles} to try again.
   */
  rolesStatus: RolesStatus;
  /**
   * Real transparency inputs for the current org session (T-029), or `null` when
   * not loaded / not an organization account. Loaded ONCE per session, never per
   * render. Consumers derive the indicator via `deriveTransparency`.
   */
  transparencySource: OrgTransparencySource | null;
  /** Loading state of {@link transparencySource}. */
  transparencyStatus: TransparencySourceStatus;
  /**
   * Reload the transparency source WITHOUT re-login — e.g. after a formalization
   * transition changes the org's state. No-op for non-organization sessions.
   */
  refreshTransparency: () => Promise<void>;
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
  /**
   * Re-attempt loading the RBAC roles after a 'degraded' state, WITHOUT a
   * re-login. Resolves once the attempt settles (roles populated or still empty).
   */
  retryRoles: () => Promise<void>;
  /**
   * Deny-by-default role check. Returns true only if the session user explicitly
   * holds `role`; false for an absent role, empty roles, or no session.
   */
  hasRole: (role: Role) => boolean;
  /**
   * Deny-by-default check for ANY of the given roles. Returns false when none
   * match, when `roles` is empty, or when there is no session.
   */
  hasAnyRole: (...roles: Role[]) => boolean;
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
  accountType: 'organization',
};

/**
 * Map the auth principal to the app-facing session user. Roles start EMPTY:
 * `AuthenticatedUser` does not carry them (they come from `GET /rbac/my-roles`),
 * so `establish()` populates them right after, before the session is exposed as
 * authenticated. An empty list means no authority (deny-by-default).
 */
function toSessionUser(user: AuthenticatedUser): SessionUser {
  return {
    id: user.id,
    name: user.displayName,
    email: user.email,
    roles: [],
    organizationId: user.organizationId,
    accountType: user.accountType,
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
  // Roles load WITHIN establishment; a bootstrapped session (tests) is already
  // 'ready' with whatever roles its initial user carries.
  const [rolesStatus, setRolesStatus] = useState<RolesStatus>('ready');
  // Transparency source: loaded once per session (T-029), never per render.
  const [transparencySource, setTransparencySource] = useState<OrgTransparencySource | null>(null);
  const [transparencyStatus, setTransparencyStatus] = useState<TransparencySourceStatus>('idle');

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
        setRolesStatus('ready');
        setTransparencySource(null);
        setTransparencyStatus('idle');
      },
    }),
  );

  // Load the caller's RBAC roles (T-025). Deny-by-default on failure: keep the
  // session authenticated but with NO roles, and surface a 'degraded' state that
  // the UI can retry. Only touches roles/rolesStatus — never the session status,
  // so it is safe to call both during establishment and on a later retry.
  const loadRoles = useCallback(async () => {
    setRolesStatus('loading');
    try {
      const roles = await api.authApi.myRoles();
      setUser((prev) => (prev ? { ...prev, roles } : prev));
      setRolesStatus('ready');
    } catch {
      // Never assume authority on failure. Roles are cleared, not preserved.
      setUser((prev) => (prev ? { ...prev, roles: [] } : prev));
      setRolesStatus('degraded');
    }
  }, [api]);

  // Load the REAL transparency source for the current org (T-029). Consumes the
  // `org` contract, ONCE per session (or on an explicit refresh), never per
  // render:
  //   - `formalizationState` ← GET /org/formalization (any member) → drives %.
  //   - `verificationLevel`  ← GET /org/documents/verification, which COMPUTES
  //     the tier but is Owner/Administrator/Auditor-gated; a 403 (or any failure)
  //     for other members degrades to no level (→ 0), never breaking the state.
  const loadTransparency = useCallback(async () => {
    setTransparencyStatus('loading');
    try {
      const [formalization, verificationLevel] = await Promise.all([
        api.client.request<FormalizationStatus>('/org/formalization'),
        api.client.request<VerificationLevel>('/org/documents/verification').catch(() => undefined),
      ]);
      setTransparencySource({ formalizationState: formalization.state, verificationLevel });
      setTransparencyStatus('ready');
    } catch {
      // Never fabricate transparency data: surface an unavailable state instead.
      setTransparencySource(null);
      setTransparencyStatus('error');
    }
  }, [api]);

  // Store tokens in memory, then load roles BEFORE exposing the session as
  // authenticated. A single round-trip at establishment (not per navigation);
  // the session stays 'loading' until the roles fetch settles either way.
  const establish = useCallback(
    async (response: AuthSession) => {
      api.tokenStore.set(tokensFromContract(response.tokens));
      setUser(toSessionUser(response.user));
      setStatus('loading');
      await loadRoles();
      setStatus('authenticated');
      // Transparency is an ORG-only indicator sourced from the REAL backend, so
      // it loads only under the http transport (the mock service has no org
      // endpoints). Fired after authentication (does not block app entry); the
      // indicator shows a loading state until it settles. One fetch per session.
      if (mode === 'http' && response.user.accountType === 'organization') {
        void loadTransparency();
      } else {
        setTransparencySource(null);
        setTransparencyStatus('idle');
      }
    },
    [api, mode, loadRoles, loadTransparency],
  );

  const signIn = useCallback(
    async (credentials?: LoginRequest) => {
      await establish(await api.authApi.login(credentials ?? DEMO_CREDENTIALS));
    },
    [api, establish],
  );

  const register = useCallback(
    async (request: RegisterRequest) => {
      await establish(await api.authApi.register(request));
    },
    [api, establish],
  );

  // Retry after a 'degraded' roles load, without re-login. The session is already
  // authenticated, so status is left untouched — only rolesStatus/roles change.
  const retryRoles = useCallback(() => loadRoles(), [loadRoles]);

  // Reload transparency without re-login (e.g. after a formalization transition).
  // No-op for non-organization accounts (nothing to show).
  const refreshTransparency = useCallback(async () => {
    if (user?.accountType !== 'organization') return;
    await loadTransparency();
  }, [user, loadTransparency]);

  const hasRole = useCallback((role: Role) => user?.roles.includes(role) ?? false, [user]);

  const hasAnyRole = useCallback(
    (...roles: Role[]) => roles.some((role) => user?.roles.includes(role) ?? false),
    [user],
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
    setRolesStatus('ready');
    setTransparencySource(null);
    setTransparencyStatus('idle');
    await api.authApi.logout(refreshToken);
  }, [api]);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      user,
      isAuthenticated: status === 'authenticated',
      rolesStatus,
      transparencySource,
      transparencyStatus,
      refreshTransparency,
      signIn,
      register,
      requestPasswordReset,
      signOut,
      retryRoles,
      hasRole,
      hasAnyRole,
    }),
    [
      status,
      user,
      rolesStatus,
      transparencySource,
      transparencyStatus,
      refreshTransparency,
      signIn,
      register,
      requestPasswordReset,
      signOut,
      retryRoles,
      hasRole,
      hasAnyRole,
    ],
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

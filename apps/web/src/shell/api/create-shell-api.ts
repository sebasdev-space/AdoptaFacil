import type { AuthTokens } from './auth-contract';
import { ApiClient } from './api-client';
import { HttpAuthApi, requestRefresh, type AuthApi } from './auth-api';
import { MockAuthApi, type MockAuthApiOptions } from './mock-auth-api';
import { InMemoryTokenStore, type TokenStore } from './token-store';

/** Default backend base URL (same source as the health client). */
export const DEFAULT_BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

export interface ShellApi {
  tokenStore: TokenStore;
  client: ApiClient;
  authApi: AuthApi;
}

export interface CreateShellApiConfig {
  baseUrl?: string;
  /**
   * Transport mode. 'mock' (default in Ola 0, no backend yet) uses an in-memory
   * auth service; 'http' talks to the real `/auth/*` endpoints. Ignored when an
   * explicit `authApi` is provided.
   */
  mode?: 'mock' | 'http';
  /** Inject a pre-built auth service (real, or a fake in tests). */
  authApi?: AuthApi;
  fetchFn?: typeof fetch;
  now?: () => number;
  onSessionExpired?: () => void;
  onTokensRefreshed?: (tokens: AuthTokens) => void;
  mock?: MockAuthApiOptions;
}

/**
 * Wire the shell's API layer: an in-memory token store, a typed client with the
 * refresh interceptor, and the auth service. Kept as a plain factory (no React)
 * so it can be unit-tested and instantiated once per app/session.
 *
 * The client's `refreshTokens` hook never routes back through the client, so the
 * interceptor cannot recurse.
 */
export function createShellApi(config: CreateShellApiConfig = {}): ShellApi {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const fetchFn = config.fetchFn ?? globalThis.fetch;
  const tokenStore = new InMemoryTokenStore();

  const shared = {
    baseUrl,
    tokenStore,
    fetchFn,
    now: config.now,
    onSessionExpired: config.onSessionExpired,
    onTokensRefreshed: config.onTokensRefreshed,
  };

  // Explicit auth service (injected real impl or test fake).
  if (config.authApi) {
    const authApi = config.authApi;
    const client = new ApiClient({ ...shared, refreshTokens: (rt) => authApi.refresh(rt) });
    return { tokenStore, client, authApi };
  }

  // Real HTTP: build the client first (refresh via a plain fetch), then the API.
  if (config.mode === 'http') {
    const client = new ApiClient({
      ...shared,
      refreshTokens: (rt) => requestRefresh(baseUrl, fetchFn, rt),
    });
    const authApi = new HttpAuthApi({ baseUrl, client, fetchFn });
    return { tokenStore, client, authApi };
  }

  // Default: in-memory mock service (Ola 0).
  const authApi = new MockAuthApi(config.mock);
  const client = new ApiClient({ ...shared, refreshTokens: (rt) => authApi.refresh(rt) });
  return { tokenStore, client, authApi };
}

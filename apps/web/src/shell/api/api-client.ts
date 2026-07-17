import type { AuthTokens } from './auth-contract';
import { ApiError, toApiError } from './api-error';
import { parseJsonResponse } from './http';
import { tokensFromContract, type TokenStore } from './token-store';

/**
 * Function that exchanges a refresh token for a fresh token pair. Injected so it
 * can hit the auth endpoint WITHOUT going back through this client (which would
 * recurse into the interceptor). Provided by the auth API layer.
 */
export type RefreshTokensFn = (refreshToken: string) => Promise<AuthTokens>;

export interface ApiClientConfig {
  /** Base URL of the backend (e.g. http://localhost:3000). */
  baseUrl: string;
  tokenStore: TokenStore;
  refreshTokens: RefreshTokensFn;
  /** Called after a successful transparent refresh (tokens already stored). */
  onTokensRefreshed?: (tokens: AuthTokens) => void;
  /** Called when the session can no longer be recovered (refresh failed/absent). */
  onSessionExpired?: () => void;
  /** Injectable for tests; defaults to global fetch. */
  fetchFn?: typeof fetch;
  /** Injectable clock for tests; defaults to Date.now. */
  now?: () => number;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: BodyInit | null;
  /** Convenience: JSON-serialize this value as the request body. */
  json?: unknown;
}

/**
 * Typed HTTP client with a transparent auth interceptor.
 *
 * On every request it attaches the in-memory access token. If a request comes
 * back 401 (or the token is known-expired beforehand), it refreshes ONCE using
 * the refresh token and retries the original request. Concurrent requests share
 * a single in-flight refresh (no refresh stampede). If the refresh fails or no
 * refresh token exists, the session is cleared and `onSessionExpired` fires.
 *
 * Tokens are never logged and never placed in a URL.
 */
export class ApiClient {
  private refreshing: Promise<AuthTokens> | null = null;

  constructor(private readonly config: ApiClientConfig) {}

  private get fetchFn(): typeof fetch {
    return this.config.fetchFn ?? globalThis.fetch;
  }

  private now(): number {
    return (this.config.now ?? Date.now)();
  }

  private url(path: string): string {
    if (/^https?:\/\//.test(path)) return path;
    return `${this.config.baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  }

  /** Perform a typed request, transparently refreshing an expired session. */
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { tokenStore } = this.config;

    // Proactive: if we already know the access token is expired, refresh first
    // so we don't waste a guaranteed-401 round trip.
    if (tokenStore.getRefreshToken() && tokenStore.isAccessTokenExpired(this.now())) {
      await this.refreshOnce();
    }

    let response = await this.send(path, options);

    // Reactive: the server rejected the (possibly still-valid-looking) token.
    if (response.status === 401 && tokenStore.getRefreshToken()) {
      await this.refreshOnce();
      response = await this.send(path, options);
    }

    // Still unauthorized after a refresh attempt → the session is gone.
    if (response.status === 401) {
      this.handleSessionExpired();
    }

    return parseJsonResponse<T>(response);
  }

  private async send(path: string, options: RequestOptions): Promise<Response> {
    const { json, headers: providedHeaders, ...rest } = options;
    const headers = new Headers(providedHeaders);
    headers.set('Accept', 'application/json');

    let body = options.body;
    if (json !== undefined) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(json);
    }

    const accessToken = this.config.tokenStore.getAccessToken();
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    try {
      return await this.fetchFn(this.url(path), { ...rest, headers, body });
    } catch (error) {
      throw toApiError(error);
    }
  }

  /**
   * Refresh the token pair at most once concurrently. Success stores the new
   * tokens; failure clears the session and rejects with an ApiError so the
   * awaiting request surfaces the expiry.
   */
  private refreshOnce(): Promise<AuthTokens> {
    if (this.refreshing) return this.refreshing;

    const refreshToken = this.config.tokenStore.getRefreshToken();
    if (!refreshToken) {
      this.handleSessionExpired();
      return Promise.reject(new ApiError(401, 'session_expired', 'No hay refresh token'));
    }

    this.refreshing = this.config
      .refreshTokens(refreshToken)
      .then((tokens) => {
        this.config.tokenStore.set(tokensFromContract(tokens, this.now()));
        this.config.onTokensRefreshed?.(tokens);
        return tokens;
      })
      .catch((error) => {
        this.handleSessionExpired();
        // Surface a uniform error to every awaiting request, keeping the cause.
        const cause = toApiError(error);
        throw new ApiError(cause.status || 401, 'session_expired', cause.message, cause);
      })
      .finally(() => {
        this.refreshing = null;
      });

    return this.refreshing;
  }

  private handleSessionExpired(): void {
    this.config.tokenStore.clear();
    this.config.onSessionExpired?.();
  }
}

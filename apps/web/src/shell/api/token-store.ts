import type { AuthTokens } from './auth-contract';

/**
 * In-memory session tokens. `expiresAt` is an ABSOLUTE epoch-ms timestamp
 * (computed from the contract's relative `expiresIn`), or null when unknown.
 */
export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
}

/**
 * Token storage abstraction. The ONLY implementation is in memory — per T-022,
 * browser storage (localStorage/sessionStorage/cookies/IndexedDB) is prohibited.
 * The interface exists so tests and (a future, separately-decided) persistence
 * strategy can substitute an implementation without touching the client.
 */
export interface TokenStore {
  get(): SessionTokens | null;
  set(tokens: SessionTokens): void;
  clear(): void;
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  /** True when we KNOW the access token is past (or within `skewMs` of) expiry. */
  isAccessTokenExpired(now?: number, skewMs?: number): boolean;
}

/** Convert contract tokens (relative `expiresIn`) into absolute-expiry storage form. */
export function tokensFromContract(tokens: AuthTokens, now: number = Date.now()): SessionTokens {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresIn > 0 ? now + tokens.expiresIn * 1000 : null,
  };
}

/**
 * The session's tokens, held only in a closure/field — never serialized. Cleared
 * on logout or when a refresh fails. Nothing here is ever logged.
 */
export class InMemoryTokenStore implements TokenStore {
  private tokens: SessionTokens | null = null;

  get(): SessionTokens | null {
    return this.tokens;
  }

  set(tokens: SessionTokens): void {
    this.tokens = tokens;
  }

  clear(): void {
    this.tokens = null;
  }

  getAccessToken(): string | null {
    return this.tokens?.accessToken ?? null;
  }

  getRefreshToken(): string | null {
    return this.tokens?.refreshToken ?? null;
  }

  isAccessTokenExpired(now: number = Date.now(), skewMs = 5000): boolean {
    if (!this.tokens || this.tokens.expiresAt == null) return false;
    return now >= this.tokens.expiresAt - skewMs;
  }
}

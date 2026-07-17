import type { AuthTokens, AuthUser, LoginRequest, LoginResponse } from './auth-contract';
import { ApiError } from './api-error';
import type { AuthApi } from './auth-api';

const DEFAULT_USER: AuthUser = {
  id: 'usr_mock_1',
  email: 'equipo@adoptafacil.org',
  displayName: 'Equipo AdoptaFácil',
  roles: ['admin'],
  organizationId: 'org_mock_1',
};

export interface MockAuthApiOptions {
  /** Access-token lifetime in seconds (short by default to exercise refresh). */
  accessTtlSeconds?: number;
  user?: AuthUser;
}

/**
 * In-memory {@link AuthApi} for Ola 0, before the backend exposes `/auth/*`.
 * Same shape as the real contract; issues opaque fake tokens, validates and
 * rotates refresh tokens, and revokes on logout. No network, no storage.
 *
 * Replace with {@link HttpAuthApi} (via the factory) once the backend is live.
 */
export class MockAuthApi implements AuthApi {
  private readonly accessTtlSeconds: number;
  private readonly user: AuthUser;
  private counter = 0;
  private readonly validRefreshTokens = new Set<string>();

  constructor(options: MockAuthApiOptions = {}) {
    this.accessTtlSeconds = options.accessTtlSeconds ?? 900;
    this.user = options.user ?? DEFAULT_USER;
  }

  private issueTokens(): AuthTokens {
    this.counter += 1;
    const refreshToken = `mock-refresh-${this.counter}`;
    // Only the most recently issued refresh token is valid (rotation).
    this.validRefreshTokens.clear();
    this.validRefreshTokens.add(refreshToken);
    return {
      accessToken: `mock-access-${this.counter}`,
      refreshToken,
      expiresIn: this.accessTtlSeconds,
    };
  }

  login(_credentials: LoginRequest): Promise<LoginResponse> {
    // The mock accepts any credentials; the real backend validates them.
    return Promise.resolve({ user: this.user, tokens: this.issueTokens() });
  }

  refresh(refreshToken: string): Promise<AuthTokens> {
    if (!this.validRefreshTokens.has(refreshToken)) {
      return Promise.reject(
        new ApiError(401, 'invalid_refresh_token', 'Refresh token inválido o revocado'),
      );
    }
    return Promise.resolve(this.issueTokens());
  }

  logout(refreshToken: string | null): Promise<void> {
    if (refreshToken) this.validRefreshTokens.delete(refreshToken);
    else this.validRefreshTokens.clear();
    return Promise.resolve();
  }

  me(): Promise<AuthUser> {
    return Promise.resolve(this.user);
  }
}

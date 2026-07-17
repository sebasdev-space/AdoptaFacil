import type {
  AuthTokens,
  AuthUser,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  LoginResponse,
  RefreshResponse,
  RegisterRequest,
  RegisterResponse,
} from './auth-contract';
import type { ApiClient } from './api-client';
import { jsonRequestInit, parseJsonResponse } from './http';
import { toApiError } from './api-error';

/**
 * Typed auth service consumed by the session layer. Method shapes come straight
 * from the (mock, soon real) contract — no DTOs are redefined here.
 */
export interface AuthApi {
  login(credentials: LoginRequest): Promise<LoginResponse>;
  /** Create an account (Organization or Person) and return a session. */
  register(request: RegisterRequest): Promise<RegisterResponse>;
  /** Request a password-reset email. Resolves generically (no account enumeration). */
  requestPasswordReset(request: ForgotPasswordRequest): Promise<ForgotPasswordResponse>;
  /** Exchange a refresh token for a fresh pair (no access token required). */
  refresh(refreshToken: string): Promise<AuthTokens>;
  /** Best-effort server-side revocation; must not throw for the caller. */
  logout(refreshToken: string | null): Promise<void>;
  /** The current principal (authenticated request). */
  me(): Promise<AuthUser>;
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

/**
 * Standalone refresh call — a PLAIN fetch that never routes through ApiClient,
 * so the interceptor cannot recurse into itself. This same function backs both
 * {@link HttpAuthApi.refresh} and the client's `refreshTokens` hook.
 */
export async function requestRefresh(
  baseUrl: string,
  fetchFn: typeof fetch,
  refreshToken: string,
): Promise<AuthTokens> {
  const response = await fetchFn(
    endpoint(baseUrl, '/auth/refresh'),
    jsonRequestInit('POST', { refreshToken }),
  );
  const body = await parseJsonResponse<RefreshResponse>(response);
  return body.tokens;
}

export interface HttpAuthApiConfig {
  baseUrl: string;
  /** Authenticated requests (e.g. me/logout) go through the interceptor. */
  client: ApiClient;
  fetchFn?: typeof fetch;
}

/** Real HTTP implementation against the backend `/auth/*` endpoints. */
export class HttpAuthApi implements AuthApi {
  private readonly baseUrl: string;
  private readonly client: ApiClient;
  private readonly fetchFn: typeof fetch;

  constructor(config: HttpAuthApiConfig) {
    this.baseUrl = config.baseUrl;
    this.client = config.client;
    this.fetchFn = config.fetchFn ?? globalThis.fetch;
  }

  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response = await this.fetchFn(
      endpoint(this.baseUrl, '/auth/login'),
      jsonRequestInit('POST', credentials),
    );
    return parseJsonResponse<LoginResponse>(response);
  }

  async register(request: RegisterRequest): Promise<RegisterResponse> {
    const response = await this.fetchFn(
      endpoint(this.baseUrl, '/auth/register'),
      jsonRequestInit('POST', request),
    );
    return parseJsonResponse<RegisterResponse>(response);
  }

  async requestPasswordReset(request: ForgotPasswordRequest): Promise<ForgotPasswordResponse> {
    const response = await this.fetchFn(
      endpoint(this.baseUrl, '/auth/forgot-password'),
      jsonRequestInit('POST', request),
    );
    return parseJsonResponse<ForgotPasswordResponse>(response);
  }

  refresh(refreshToken: string): Promise<AuthTokens> {
    return requestRefresh(this.baseUrl, this.fetchFn, refreshToken);
  }

  async logout(refreshToken: string | null): Promise<void> {
    try {
      const response = await this.fetchFn(
        endpoint(this.baseUrl, '/auth/logout'),
        jsonRequestInit('POST', { refreshToken }),
      );
      await parseJsonResponse<void>(response);
    } catch {
      // Logout is best-effort: local session teardown happens regardless.
    }
  }

  me(): Promise<AuthUser> {
    return this.client.request<AuthUser>('/auth/me').catch((error) => {
      throw toApiError(error);
    });
  }
}

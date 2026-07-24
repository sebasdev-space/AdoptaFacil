import type {
  AuthTokens,
  AuthenticatedUser,
  ForgotPasswordRequest,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  Role,
} from './auth-contract';
import type { ApiClient } from './api-client';
import { jsonRequestInit, parseJsonResponse } from './http';
import { toApiError } from './api-error';

/**
 * Typed auth service consumed by the session layer. Method shapes come straight
 * from the real `@adoptafacil/contracts` (re-exported via `auth-contract`) — no
 * DTOs are redefined here.
 */
export interface AuthApi {
  login(credentials: LoginRequest): Promise<LoginResponse>;
  /** Create an account (Organization or Person) and return a session. */
  register(request: RegisterRequest): Promise<RegisterResponse>;
  /** Request a password reset. Resolves with no body (202); never enumerates. */
  requestPasswordReset(request: ForgotPasswordRequest): Promise<void>;
  /** Exchange a refresh token for a fresh pair (no access token required). */
  refresh(refreshToken: string): Promise<AuthTokens>;
  /** Best-effort server-side revocation; must not throw for the caller. */
  logout(refreshToken: string | null): Promise<void>;
  /** The current principal (authenticated request). */
  me(): Promise<AuthenticatedUser>;
  /**
   * The caller's own RBAC roles (authenticated request → `GET /rbac/my-roles`,
   * T-012). Returns the real {@link Role} enum values from the contract. May
   * reject; the session layer treats a failure as deny-by-default (no authority).
   */
  myRoles(): Promise<Role[]>;
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

/**
 * Standalone refresh call — a PLAIN fetch that never routes through ApiClient,
 * so the interceptor cannot recurse into itself. This same function backs both
 * {@link HttpAuthApi.refresh} and the client's `refreshTokens` hook. The backend
 * returns the token pair DIRECTLY (no envelope).
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
  return parseJsonResponse<AuthTokens>(response);
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
    // Bind the default `fetch` to its global receiver: stored on `this` and
    // invoked as `this.fetchFn(...)`, an unbound global fetch is called with the
    // wrong `this` and browsers throw "Illegal invocation". Injected fetches
    // (tests) are used as-is.
    this.fetchFn = config.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response = await this.fetchFn(
      endpoint(this.baseUrl, '/auth/login'),
      jsonRequestInit('POST', credentials),
    );
    return parseJsonResponse<LoginResponse>(response);
  }

  async register(request: RegisterRequest): Promise<RegisterResponse> {
    // The backend splits registration by account type; the discriminator is a
    // web-only routing tag, so strip it and POST the exact DTO it expects.
    const { accountType, ...dto } = request;
    const path =
      accountType === 'organization' ? '/auth/register/organization' : '/auth/register/person';
    const response = await this.fetchFn(endpoint(this.baseUrl, path), jsonRequestInit('POST', dto));
    return parseJsonResponse<RegisterResponse>(response);
  }

  async requestPasswordReset(request: ForgotPasswordRequest): Promise<void> {
    const response = await this.fetchFn(
      endpoint(this.baseUrl, '/auth/password-reset'),
      jsonRequestInit('POST', request),
    );
    // 202 Accepted with no body; parseJsonResponse throws on non-2xx.
    await parseJsonResponse<void>(response);
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

  me(): Promise<AuthenticatedUser> {
    return this.client.request<AuthenticatedUser>('/auth/me').catch((error) => {
      throw toApiError(error);
    });
  }

  myRoles(): Promise<Role[]> {
    // Authenticated: routes through the client so the refresh interceptor applies.
    return this.client.request<Role[]>('/rbac/my-roles').catch((error) => {
      throw toApiError(error);
    });
  }
}

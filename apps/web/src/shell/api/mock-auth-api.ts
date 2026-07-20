import type {
  AuthTokens,
  AuthenticatedUser,
  ForgotPasswordRequest,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
} from './auth-contract';
import { Role } from './auth-contract';
import { ApiError } from './api-error';
import type { AuthApi } from './auth-api';

const DEMO_USER: AuthenticatedUser = {
  id: 'usr_mock_1',
  email: 'demo@adoptafacil.org',
  displayName: 'Equipo AdoptaFácil',
  accountType: 'organization',
  organizationId: 'org_mock_1',
};

const DEMO_PASSWORD = 'demo';

interface MockAccount {
  password: string;
  user: AuthenticatedUser;
}

export interface MockAuthApiOptions {
  /** Access-token lifetime in seconds (short by default to exercise refresh). */
  accessTtlSeconds?: number;
  /** Override the seeded demo user. */
  user?: AuthenticatedUser;
  /**
   * Roles returned by {@link MockAuthApi.myRoles}. Defaults to `[Role.Owner]`,
   * mirroring the backend granting Owner to an organization's first user (T-012b).
   */
  roles?: Role[];
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * In-memory {@link AuthApi} for local dev and tests, mirroring the SHAPE of the
 * real contract: it keeps an in-memory account registry (seeded with a demo
 * account), validates credentials on login, creates accounts on register,
 * rotates/validates refresh tokens, and revokes on logout. No network, no
 * browser storage.
 *
 * The real backend is used via {@link HttpAuthApi} (transport mode 'http'); this
 * mock stays aligned so tests keep protecting the real request/response shapes.
 */
export class MockAuthApi implements AuthApi {
  private readonly accessTtlSeconds: number;
  private counter = 0;
  private readonly accounts = new Map<string, MockAccount>();
  private readonly validRefreshTokens = new Set<string>();
  private readonly roles: Role[];

  constructor(options: MockAuthApiOptions = {}) {
    this.accessTtlSeconds = options.accessTtlSeconds ?? 900;
    this.roles = options.roles ?? [Role.Owner];
    const demoUser = options.user ?? DEMO_USER;
    this.accounts.set(normalizeEmail(demoUser.email), {
      password: DEMO_PASSWORD,
      user: demoUser,
    });
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
      tokenType: 'Bearer',
      expiresIn: this.accessTtlSeconds,
    };
  }

  private nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}_${this.counter}`;
  }

  login(credentials: LoginRequest): Promise<LoginResponse> {
    const account = this.accounts.get(normalizeEmail(credentials.email));
    if (!account || account.password !== credentials.password) {
      // Generic message — never reveals whether the email exists.
      return Promise.reject(
        new ApiError(401, 'invalid_credentials', 'Correo o contraseña inválidos'),
      );
    }
    return Promise.resolve({ user: account.user, tokens: this.issueTokens() });
  }

  register(request: RegisterRequest): Promise<RegisterResponse> {
    const email = normalizeEmail(request.email);
    if (this.accounts.has(email)) {
      return Promise.reject(
        new ApiError(409, 'email_taken', 'Ya existe una cuenta con este correo'),
      );
    }

    // Both DTOs carry `displayName`; a Person also gets their own organization
    // so multi-tenant RLS applies uniformly (mirrors the backend).
    const user: AuthenticatedUser = {
      id: this.nextId('usr'),
      email: request.email,
      displayName: request.displayName,
      accountType: request.accountType,
      organizationId: this.nextId('org'),
    };

    this.accounts.set(email, { password: request.password, user });
    return Promise.resolve({ user, tokens: this.issueTokens() });
  }

  requestPasswordReset(_request: ForgotPasswordRequest): Promise<void> {
    // Always resolves, regardless of whether the account exists (no enumeration).
    // The real backend returns 202 with no body; the generic confirmation copy
    // lives in the UI.
    return Promise.resolve();
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

  me(): Promise<AuthenticatedUser> {
    const [account] = this.accounts.values();
    return Promise.resolve(account?.user ?? DEMO_USER);
  }

  myRoles(): Promise<Role[]> {
    // Fresh copy so callers can't mutate the mock's internal list.
    return Promise.resolve([...this.roles]);
  }
}

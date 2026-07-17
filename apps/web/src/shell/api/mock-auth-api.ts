import type {
  AuthTokens,
  AuthUser,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
} from './auth-contract';
import { ApiError } from './api-error';
import type { AuthApi } from './auth-api';

const DEMO_USER: AuthUser = {
  id: 'usr_mock_1',
  email: 'demo@adoptafacil.org',
  displayName: 'Equipo AdoptaFácil',
  roles: ['admin'],
  organizationId: 'org_mock_1',
};

const DEMO_PASSWORD = 'demo';

interface MockAccount {
  password: string;
  user: AuthUser;
}

export interface MockAuthApiOptions {
  /** Access-token lifetime in seconds (short by default to exercise refresh). */
  accessTtlSeconds?: number;
  /** Override the seeded demo user. */
  user?: AuthUser;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * In-memory {@link AuthApi} for Ola 0, before the backend exposes `/auth/*`.
 * Same shape as the real (mock) contract: it keeps an in-memory account registry
 * (seeded with a demo account), validates credentials on login, creates accounts
 * on register, rotates/validates refresh tokens, and revokes on logout. No
 * network, no browser storage.
 *
 * Replace with {@link HttpAuthApi} (via the factory) once the backend is live.
 */
export class MockAuthApi implements AuthApi {
  private readonly accessTtlSeconds: number;
  private counter = 0;
  private readonly accounts = new Map<string, MockAccount>();
  private readonly validRefreshTokens = new Set<string>();

  constructor(options: MockAuthApiOptions = {}) {
    this.accessTtlSeconds = options.accessTtlSeconds ?? 900;
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

    const user: AuthUser =
      request.accountType === 'organization'
        ? {
            id: this.nextId('usr'),
            email: request.email,
            displayName: request.organizationName,
            roles: ['org_admin'],
            organizationId: this.nextId('org'),
          }
        : {
            id: this.nextId('usr'),
            email: request.email,
            displayName: `${request.firstName} ${request.lastName}`.trim(),
            roles: ['person'],
          };

    this.accounts.set(email, { password: request.password, user });
    return Promise.resolve({ user, tokens: this.issueTokens() });
  }

  requestPasswordReset(_request: ForgotPasswordRequest): Promise<ForgotPasswordResponse> {
    // Always generic, regardless of whether the account exists (no enumeration).
    return Promise.resolve({
      message:
        'Si el correo está registrado, enviaremos instrucciones para restablecer la contraseña.',
    });
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
    const [account] = this.accounts.values();
    return Promise.resolve(account?.user ?? DEMO_USER);
  }
}

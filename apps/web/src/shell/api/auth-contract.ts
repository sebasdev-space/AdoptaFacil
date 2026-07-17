/**
 * Auth contract — LOCAL MOCK (T-022).
 *
 * The real contract is owned by @sebastian and will be published at
 * `packages/contracts/auth.ts` (his T-011). It is not available yet, so per the
 * task this file mirrors its expected shape (§M02 auth, contract-first).
 *
 * ⚠️ SWAP WHEN PUBLISHED: replace the interface bodies below with
 *   `export * from '@adoptafacil/contracts';`  // auth types
 * (or re-export the specific auth types). Every consumer imports auth DTOs from
 * this module, so the swap is a single-file change and no DTOs are redefined by
 * hand anywhere else.
 */

/** Credentials submitted to `POST /auth/login`. */
export interface LoginRequest {
  email: string;
  password: string;
}

/** The authenticated principal. */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  /** Coarse RBAC roles. */
  roles: string[];
  /** Tenant the session is scoped to, when applicable (RNF03 multi-tenant). */
  organizationId?: string;
}

/** Token pair returned by login and refresh. Never persisted to browser storage. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires (relative, as issued by the server). */
  expiresIn: number;
}

/** Response body of `POST /auth/login`. */
export interface LoginResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

/** Response body of `POST /auth/refresh`. */
export interface RefreshResponse {
  tokens: AuthTokens;
}

/** Kind of account being created (§13: two account types). */
export type AccountType = 'organization' | 'person';

/** Registration payload for an Organization account (§M02, §13). */
export interface RegisterOrganizationRequest {
  accountType: 'organization';
  organizationName: string;
  /** Colombian tax id (NIT). */
  nit: string;
  /** Legal representative / primary contact. */
  contactName: string;
  email: string;
  password: string;
  phone?: string;
}

/** Registration payload for a Person account (§M02, §13). */
export interface RegisterPersonRequest {
  accountType: 'person';
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
}

/** Discriminated union — the `accountType` tag keeps Org and Person fields apart. */
export type RegisterRequest = RegisterOrganizationRequest | RegisterPersonRequest;

/** Registration establishes a session, so it returns the same shape as login. */
export type RegisterResponse = LoginResponse;

/** Payload for `POST /auth/forgot-password`. */
export interface ForgotPasswordRequest {
  email: string;
}

/** Response for a password-reset request — deliberately generic (no enumeration). */
export interface ForgotPasswordResponse {
  message: string;
}

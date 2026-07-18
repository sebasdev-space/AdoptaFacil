// Module: M02 auth · Contracts owner: @sebastian
//
// Public, STABLE contract consumed by the web auth screens (Fabián, T-F04) and
// by the API. Two account types exist — Organization and Person; a Person
// exercises capabilities (adopt, donate, …) without changing account type.
// All timestamps are ISO-8601 UTC.

/** The two kinds of account. */
export type AccountType = 'organization' | 'person';

/** Registration for an Organization account. Creates the organization and its
 *  first (owner) user. */
export interface RegisterOrganizationDto {
  organizationName: string;
  displayName: string;
  email: string;
  password: string;
}

/** Registration for a Person account. The person gets their own personal
 *  organization (tenant) so multi-tenant RLS applies uniformly. */
export interface RegisterPersonDto {
  displayName: string;
  email: string;
  password: string;
}

/** Credentials for login. */
export interface LoginDto {
  email: string;
  password: string;
}

/** Exchange a refresh token for a fresh token pair (the refresh token rotates). */
export interface RefreshDto {
  refreshToken: string;
}

/** Revoke a refresh token (logout). */
export interface LogoutDto {
  refreshToken: string;
}

/** Request a password-reset token (delivered via the notification port). Always
 *  succeeds regardless of whether the email exists, to avoid account enumeration. */
export interface PasswordResetRequestDto {
  email: string;
}

/** Access + refresh tokens issued on register/login/refresh. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  /** Access-token lifetime in seconds. */
  expiresIn: number;
}

/** The authenticated principal — safe to expose to the client (no secrets). */
export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  accountType: AccountType;
  organizationId: string;
}

/** Returned by register and login: the user plus their fresh tokens. */
export interface AuthSession {
  user: AuthenticatedUser;
  tokens: AuthTokens;
}

/** Claims carried inside the signed access token (JWT payload). */
export interface AccessTokenClaims {
  /** Subject — the user id. */
  sub: string;
  /** Active organization / tenant id. */
  org: string;
  /** Account type. */
  typ: AccountType;
  email: string;
}

/**
 * Auth contract — thin adapter over the published `@adoptafacil/contracts` (T-024).
 *
 * Since T-011/T-012 the real contract is published, so this module no longer
 * defines DTOs by hand. It RE-EXPORTS the real types under the names the web
 * already uses, and adds the one thing the backend does not model: a single
 * registration input union (the backend splits registration into two endpoints,
 * so the HTTP layer reads `accountType`, strips it, and routes accordingly).
 */
import type {
  AuthSession,
  LoginDto,
  PasswordResetRequestDto,
  RegisterOrganizationDto,
  RegisterPersonDto,
} from '@adoptafacil/contracts';

// Real contract types consumed across the web auth layer.
export type {
  AccountType,
  AuthTokens,
  AuthenticatedUser,
  AuthSession,
  LoginDto,
  RegisterOrganizationDto,
  RegisterPersonDto,
  PasswordResetRequestDto,
  RefreshDto,
  LogoutDto,
} from '@adoptafacil/contracts';

// --- Web-boundary aliases (the names the web components already use) ---------

/** Credentials submitted to `POST /auth/login`. */
export type LoginRequest = LoginDto;

/** Response of login/register: the authenticated user plus a fresh token pair. */
export type LoginResponse = AuthSession;
export type RegisterResponse = AuthSession;

/** Payload for the password-reset request. */
export type ForgotPasswordRequest = PasswordResetRequestDto;

// --- Web-only registration input model ---------------------------------------
// The backend exposes `/auth/register/organization` and `/auth/register/person`
// with DTOs that carry NO discriminant. The web keeps a single discriminated
// union at the form boundary; `HttpAuthApi.register` reads `accountType`, strips
// it, and POSTs the exact DTO to the matching endpoint.

export interface RegisterOrganizationRequest extends RegisterOrganizationDto {
  accountType: 'organization';
}

export interface RegisterPersonRequest extends RegisterPersonDto {
  accountType: 'person';
}

export type RegisterRequest = RegisterOrganizationRequest | RegisterPersonRequest;

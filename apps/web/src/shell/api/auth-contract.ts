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
  CompleteProfileInput,
  GoogleSignInInput,
  LoginDto,
  PasswordResetConfirmDto,
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
  CompleteProfileInput,
  GoogleSignInInput,
  IncompleteProfileError,
  LoginDto,
  ProfileRequiredField,
  RegisterOrganizationDto,
  RegisterPersonDto,
  PasswordResetRequestDto,
  PasswordResetConfirmDto,
  RefreshDto,
  LogoutDto,
} from '@adoptafacil/contracts';
export { PROFILE_REQUIRED_FIELDS } from '@adoptafacil/contracts';

// `Role` is an ENUM (a runtime value, not just a type): RBAC gating compares
// against `Role.Owner` etc., never against loose strings. Re-exported here so the
// web keeps a single contract-boundary module (T-025 consumes `GET /rbac/my-roles`).
export { Role } from '@adoptafacil/contracts';

// --- Web-boundary aliases (the names the web components already use) ---------

/** Credentials submitted to `POST /auth/login`. */
export type LoginRequest = LoginDto;

/** Response of login/register: the authenticated user plus a fresh token pair. */
export type LoginResponse = AuthSession;
export type RegisterResponse = AuthSession;

/** Payload for the password-reset request (step 1: send the link). */
export type ForgotPasswordRequest = PasswordResetRequestDto;

/** Payload to confirm a reset (step 2: token from the link + new password). */
export type ResetPasswordRequest = PasswordResetConfirmDto;

/** Payload submitted to `POST /auth/google` — the raw ID token from Google
 *  Identity Services (or the FakeIdentityAdapter's documented test format). */
export type GoogleSignInRequest = GoogleSignInInput;

/** Payload submitted to `PATCH /auth/me/profile` — every field independently
 *  optional (only what's still missing needs to be sent). */
export type CompleteProfileRequest = CompleteProfileInput;

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

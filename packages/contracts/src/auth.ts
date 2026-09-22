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

/** Confirm a password reset: the single-use token from the emailed link plus the
 *  new password. The token is validated (exists, not expired, not used); on
 *  success the password is changed and the user's active sessions are revoked. */
export interface PasswordResetConfirmDto {
  token: string;
  password: string;
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
  // --- Person profile fields (T-Google-SignIn) -------------------------------
  // ADDITIVE, optional: populated once the account completes its profile (see
  // `CompleteProfileInput`/`PROFILE_REQUIRED_FIELDS` below). Absent/undefined
  // for an Organization account (which never gates on these) and for a Person
  // that hasn't completed their profile yet.
  phone?: string;
  documentId?: string;
  address?: string;
}

/** Google Sign-In (`POST /auth/google`): the ID token from Google Identity
 *  Services. Verified via `IdentityPort`; auto-links to an existing
 *  `AuthCredential` by email or creates a NEW lightweight Person account —
 *  NEVER an Organization (registering one stays the long NIT/legal-rep form).
 *  Ends the same way as password login/register: a fresh `AuthSession`. */
export interface GoogleSignInInput {
  idToken: string;
}

// ============================================================================
// Profile-completion gate (T-Google-SignIn). A Person account (via Google or
// password) must have all three fields below before: creating a donation or
// sponsorship, creating an adoption request, or enrolling in a volunteer
// opportunity. No other action is gated by this (browsing, registering an
// organization, etc. are always allowed).
// ============================================================================

/** The 3 fields the profile-completion gate requires. Order is stable — it is
 *  also the order `missing` is reported in by `IncompleteProfileError`. */
export const PROFILE_REQUIRED_FIELDS = ['phone', 'documentId', 'address'] as const;

/** One of the 3 gated profile fields. */
export type ProfileRequiredField = (typeof PROFILE_REQUIRED_FIELDS)[number];

/** `PATCH /users/me/profile` — completes/updates the caller's own Person
 *  profile. Every field is independently optional so a caller can fill in
 *  just the ones still missing; omitted fields are left unchanged. */
export interface CompleteProfileInput {
  phone?: string;
  documentId?: string;
  address?: string;
}

/**
 * Error BODY (not a class — this is a wire shape) returned with HTTP 422 by
 * every gated endpoint (donations/sponsorships, adoption requests, volunteer
 * enrollment) when the actor's profile is missing one or more required
 * fields. `missing` lists ONLY the still-missing fields, in
 * `PROFILE_REQUIRED_FIELDS` order. The web's "Completa tu perfil" screen
 * matches on `error === 'INCOMPLETE_PROFILE'`.
 */
export interface IncompleteProfileError {
  error: 'INCOMPLETE_PROFILE';
  missing: ProfileRequiredField[];
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

// ============================================================================
// RBAC (§13) — roles & authority. Role assignment is per-user WITHIN an
// organization; authorization is always evaluated together with the tenant
// context (an Administrator of Org A has no authority over Org B). The role
// names are the DOCUMENT-BASE names (not the wireframe labels).
// ============================================================================

/**
 * The roles from the base document (§13). Organization-internal roles plus the
 * two platform-level roles. String values are stable — do not rename.
 */
export enum Role {
  /** propietario / representante legal */
  Owner = 'owner',
  /** administrador */
  Administrator = 'administrator',
  /** operador */
  Operator = 'operator',
  /** voluntario */
  Volunteer = 'volunteer',
  /** colaborador temporal */
  TemporaryCollaborator = 'temporary_collaborator',
  /** veterinario */
  Veterinarian = 'veterinarian',
  /** auditor de solo lectura */
  ReadOnlyAuditor = 'read_only_auditor',
  /** Admin de plataforma */
  PlatformAdmin = 'platform_admin',
  /** SuperAdmin de plataforma */
  PlatformSuperAdmin = 'platform_super_admin',
}

/** Roles internal to an organization (§13). */
export const ORG_ROLES: readonly Role[] = [
  Role.Owner,
  Role.Administrator,
  Role.Operator,
  Role.Volunteer,
  Role.TemporaryCollaborator,
  Role.Veterinarian,
  Role.ReadOnlyAuditor,
];

/** Platform-level roles (§13). */
export const PLATFORM_ROLES: readonly Role[] = [Role.PlatformAdmin, Role.PlatformSuperAdmin];

/** A role held by a user within an organization. */
export interface RoleAssignment {
  userId: string;
  role: Role;
  organizationId: string;
  /** ISO-8601 UTC. */
  createdAt: string;
}

/** Assign a role to a user in the caller's organization. */
export interface AssignRoleDto {
  userId: string;
  role: Role;
}

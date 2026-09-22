/**
 * Normalized error thrown by the shell API layer. Carries the HTTP status and a
 * machine-readable `code` so callers (and the session layer) can branch without
 * string-matching messages. Never contains tokens.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static is(error: unknown): error is ApiError {
    return error instanceof ApiError;
  }
}

/** Wrap an unknown thrown value as an ApiError (e.g. a network failure). */
export function toApiError(error: unknown, fallbackCode = 'network_error'): ApiError {
  if (ApiError.is(error)) return error;
  const message = error instanceof Error ? error.message : 'Error de red';
  return new ApiError(0, fallbackCode, message);
}

/**
 * The profile-completion gate (T-Google-SignIn, business rule #3): donations/
 * sponsorships, adoption requests and volunteer enrollment all respond 422
 * with `{ error: 'INCOMPLETE_PROFILE', missing: [...] }` (see
 * `apps/api/src/core/auth/require-complete-profile.ts`) when the actor's
 * `phone`/`documentId`/`address` aren't all set. `ApiError.details` carries
 * the parsed body VERBATIM (see `apiErrorFromResponse` above), so this just
 * narrows it — never string-matches `error.message`.
 */
export function isIncompleteProfileError(error: unknown): error is ApiError {
  if (!ApiError.is(error) || error.status !== 422) return false;
  const body = error.details as { error?: unknown } | undefined;
  return body?.error === 'INCOMPLETE_PROFILE';
}

/** The still-missing fields from an {@link isIncompleteProfileError}, or `[]`
 *  if the error doesn't carry that shape. */
export function missingProfileFields(error: unknown): string[] {
  if (!isIncompleteProfileError(error)) return [];
  const body = error.details as { missing?: unknown } | undefined;
  return Array.isArray(body?.missing)
    ? body.missing.filter((f): f is string => typeof f === 'string')
    : [];
}

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

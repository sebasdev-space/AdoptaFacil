import { ApiError } from './api-error';

/**
 * Low-level HTTP helpers shared by the API client and the auth endpoints.
 * Deliberately tiny and transport-only: no token handling lives here.
 */

const STATUS_CODES: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  422: 'unprocessable',
  429: 'too_many_requests',
  500: 'server_error',
  503: 'unavailable',
};

interface ErrorBody {
  code?: unknown;
  message?: unknown;
}

/**
 * Nest's `ZodValidationPipe` (apps/api/src/core/auth/zod-validation.pipe.ts)
 * throws `BadRequestException(string[])` — an array of per-field issue
 * strings, not a single string. Passed to `HttpException`, that array becomes
 * `body.message` VERBATIM (never joined into one string by Nest). Before this
 * fix, `apiErrorFromResponse` only accepted a plain `string` for `message`,
 * so every one of these validation errors silently fell back to the generic
 * `response.statusText` ("Bad Request") instead of the actual, specific
 * message a backend Zod schema already computed — found while wiring the
 * slug 409 error through and confirmed by reading `zod-validation.pipe.ts`.
 */
function extractMessage(rawMessage: unknown): string | undefined {
  if (typeof rawMessage === 'string' && rawMessage) return rawMessage;
  if (Array.isArray(rawMessage)) {
    const joined = rawMessage.filter((item): item is string => typeof item === 'string').join(' ');
    return joined || undefined;
  }
  return undefined;
}

/** Build a JSON request init, stringifying `json` when provided. */
export function jsonRequestInit(method: string, json?: unknown): RequestInit {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const init: RequestInit = { method, headers };
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  }
  return init;
}

/**
 * Build a normalized `ApiError` from a non-2xx `Response`, best-effort parsing a
 * JSON error body for `code`/`message`. Shared by JSON and binary transports so
 * both surface the SAME typed error shape (never a raw throw or a failed parse).
 */
export async function apiErrorFromResponse(response: Response): Promise<ApiError> {
  let body: ErrorBody | undefined;
  try {
    body = (await response.json()) as ErrorBody;
  } catch {
    body = undefined;
  }
  const code =
    typeof body?.code === 'string' ? body.code : (STATUS_CODES[response.status] ?? 'http_error');
  const message =
    extractMessage(body?.message) ?? (response.statusText || `HTTP ${response.status}`);
  return new ApiError(response.status, code, message, body);
}

/**
 * Parse a `Response`, throwing a normalized `ApiError` on non-2xx. Returns
 * `undefined` for empty (204) bodies.
 */
export async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }

  if (response.status === 204 || response.headers.get('Content-Length') === '0') {
    return undefined as T;
  }

  try {
    return (await response.json()) as T;
  } catch {
    return undefined as T;
  }
}

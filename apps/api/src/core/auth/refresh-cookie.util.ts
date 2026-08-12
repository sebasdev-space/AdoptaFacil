import type { CookieOptions, Response } from 'express';

/**
 * httpOnly cookie carrying the (opaque, already-hashed-at-rest) refresh token,
 * scoped to `/auth` only. Lets a hard reload / new tab silently resume the
 * session via `POST /auth/refresh/silent` — the access token NEVER goes in a
 * cookie, only this same refresh token the JSON response always carries too.
 * httpOnly keeps it unreadable by page JS, so an XSS cannot exfiltrate it —
 * the property T-022 (see token-store.ts) was protecting in the first place.
 */
export const REFRESH_COOKIE_NAME = 'af_refresh';

function cookieOptions(maxAgeMs: number, isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    // Cross-origin in production (web/api on different domains) needs
    // SameSite=None, which browsers only honor alongside Secure.
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/auth',
    maxAge: maxAgeMs,
  };
}

export function setRefreshCookie(
  res: Response,
  refreshToken: string,
  refreshTtlSeconds: number,
  isProduction: boolean,
): void {
  res.cookie(
    REFRESH_COOKIE_NAME,
    refreshToken,
    cookieOptions(refreshTtlSeconds * 1000, isProduction),
  );
}

export function clearRefreshCookie(res: Response, isProduction: boolean): void {
  res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions(0, isProduction));
}

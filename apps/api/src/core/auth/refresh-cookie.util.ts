import type { CookieOptions, Response } from 'express';

/**
 * httpOnly cookie carrying the (opaque, already-hashed-at-rest) refresh token.
 * Lets a hard reload / new tab silently resume the session via
 * `POST /auth/refresh/silent` — the access token NEVER goes in a cookie, only
 * this same refresh token the JSON response always carries too. httpOnly
 * keeps it unreadable by page JS, so an XSS cannot exfiltrate it — the
 * property T-022 (see token-store.ts) was protecting in the first place.
 */
export const REFRESH_COOKIE_NAME = 'af_refresh';

function cookieOptions(maxAgeMs: number, isProduction: boolean): CookieOptions {
  return {
    httpOnly: true,
    // Cross-origin in production (web/api on different domains) needs
    // SameSite=None, which browsers only honor alongside Secure.
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    // CRUCE DE DOMINIO (@fabian, avisar a @sebastian): esto era `path: '/auth'`
    // — correcto contra la API directa, pero rompe en cualquier front que
    // llegue a `/auth/*` detrás de un prefijo (p.ej. el proxy `/api` temporal
    // de Vite para el túnel ngrok, ver `apps/web/vite.config.ts`): el browser
    // decide qué cookie adjuntar según la ruta QUE ÉL VE (`/api/auth/...`),
    // no la ruta real del backend tras el rewrite — así que nunca calzaba con
    // `/auth` y el refresh silencioso fallaba, forzando un login manual justo
    // al volver de una navegación completa (p.ej. el round trip de OAuth de
    // Mercado Pago, T-OAuth-Connect). `/` evita que un futuro prefijo rompa
    // esto de nuevo; sigue siendo httpOnly + Secure + SameSite, solo viaja
    // en más requests del mismo origen.
    path: '/',
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

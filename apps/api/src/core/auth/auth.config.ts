/**
 * Auth configuration, read from the environment at DI time (never at import
 * time, so ConfigModule has already populated process.env). JWT_SECRET is
 * required in production and falls back to an obvious dev-only value otherwise
 * so local/CI boots without extra setup. Secrets are never logged.
 */
export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

export interface AuthConfig {
  jwtSecret: string;
  /** Access-token lifetime in seconds (default 15 min). */
  accessTtlSeconds: number;
  /** Refresh-token lifetime in seconds (default 7 days). */
  refreshTtlSeconds: number;
}

const DEV_SECRET = 'dev-only-insecure-jwt-secret-change-me';

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function loadAuthConfig(): AuthConfig {
  const isProd = process.env.NODE_ENV === 'production';
  const jwtSecret = process.env.JWT_SECRET ?? (isProd ? '' : DEV_SECRET);
  if (!jwtSecret) {
    throw new Error('JWT_SECRET must be set in production for the auth module to sign tokens.');
  }
  return {
    jwtSecret,
    accessTtlSeconds: positiveInt(process.env.JWT_ACCESS_TTL, 15 * 60),
    refreshTtlSeconds: positiveInt(process.env.JWT_REFRESH_TTL, 7 * 24 * 60 * 60),
  };
}

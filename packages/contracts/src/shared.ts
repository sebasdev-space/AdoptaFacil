/**
 * Cross-cutting contracts consumed by more than one app.
 * Owner: bootstrap (T-000). Extend cautiously — changes here are breaking.
 */

/** Response shape of `GET /health`, shared by apps/api and apps/web. */
export interface HealthStatus {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  redis: 'up' | 'down';
}

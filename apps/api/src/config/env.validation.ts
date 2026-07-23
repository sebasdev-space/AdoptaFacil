import { z } from 'zod';

/**
 * Single source of truth for backend configuration.
 * The API refuses to boot if any required variable is missing or malformed —
 * this is the "validación de configuración al arranque" required by Sprint 0.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  // Comma-separated list of allowed CORS origins.
  API_CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  DATABASE_URL: z.string().url(),
  // Non-superuser application role connection (RLS is enforced against it).
  // Must be part of the validated schema: @nestjs/config only assigns the
  // VALIDATED keys back to process.env, and PrismaService reads
  // process.env.DATABASE_URL_APP at construction — omitting it here would strip
  // it from process.env and break `pnpm --filter api dev`.
  DATABASE_URL_APP: z.string().url(),
  REDIS_URL: z.string().url(),
  NOTIFICATION_DRIVER: z.enum(['log']).default('log'),
  // T-106 (M03/RF09): interval of the repeatable clinical-reminders scan job.
  // Configurable for dev/test; defaults to daily. Kept in the validated schema so
  // it survives @nestjs/config (which only re-exposes validated keys).
  REMINDERS_SCAN_INTERVAL_MS: z.coerce.number().int().positive().default(86_400_000),
  // Look-ahead window (days) for the scan: events due within this many days
  // (or already overdue) generate a reminder.
  REMINDERS_WINDOW_DAYS: z.coerce.number().int().min(0).max(365).default(30),
});

export type Env = z.infer<typeof envSchema>;

/**
 * @nestjs/config `validate` hook. Throws a readable error listing every
 * offending variable so a misconfigured environment fails fast and loud.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

/** Parse REDIS_URL into the host/port shape BullMQ and ioredis expect. */
export function parseRedisUrl(redisUrl: string): { host: string; port: number } {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
  };
}

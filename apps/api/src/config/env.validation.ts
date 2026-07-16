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
  REDIS_URL: z.string().url(),
  NOTIFICATION_DRIVER: z.enum(['log']).default('log'),
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

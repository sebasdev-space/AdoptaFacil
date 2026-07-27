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
  // T-110 (auth/RF05): base URL of the web app, used to build the clickable
  // password-reset link emailed to users ({WEB_BASE_URL}/reset-password?token=…).
  // Defaults to the Vite dev server so local dev works without extra config; set
  // it to the real public origin in production.
  WEB_BASE_URL: z.string().url().default('http://localhost:5173'),
  // T-109 (notifications): which NotificationPort adapter to bind. `log` = stub
  // that only logs (default; tests/dev never send). `smtp` = real email via
  // SMTP. Swap happens in NotificationModule, no consumer changes. When `smtp`,
  // the SMTP_* vars below are REQUIRED (fail-fast, see the refine).
  NOTIFICATION_DRIVER: z.enum(['log', 'smtp']).default('log'),
  // SMTP credentials — read ONLY from env; never hardcoded, never committed.
  // Optional at the schema level so `log` mode boots without them; the refine
  // enforces their presence when the driver is `smtp`.
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  SMTP_FROM: z.string().min(1).optional(),
  // T-106 (M03/RF09): interval of the repeatable clinical-reminders scan job.
  // Configurable for dev/test; defaults to daily. Kept in the validated schema so
  // it survives @nestjs/config (which only re-exposes validated keys).
  REMINDERS_SCAN_INTERVAL_MS: z.coerce.number().int().positive().default(86_400_000),
  // Look-ahead window (days) for the scan: events due within this many days
  // (or already overdue) generate a reminder.
  REMINDERS_WINDOW_DAYS: z.coerce.number().int().min(0).max(365).default(30),
  // T-108 (storage): which StoragePort adapter to bind. `disk` = real filesystem
  // (prod on the VPS); `stub` = in-memory (tests set this via load-env). Default
  // `disk` so production persists real bytes unless explicitly overridden.
  STORAGE_DRIVER: z.enum(['stub', 'disk']).default('disk'),
  // Root directory for the disk adapter (outside the webroot; per-tenant subdirs).
  STORAGE_DISK_ROOT: z.string().min(1).default('./.storage'),
  // Max upload size in MB (enforced by the adapter and the upload endpoint).
  STORAGE_MAX_FILE_MB: z.coerce.number().int().positive().max(100).default(15),
  // Base URL the API is reachable at, used to build upload/serve URLs.
  STORAGE_PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  // T-052 (payments): which PaymentPort adapter to bind. 'fake' = deterministic
  // dev/test double (default); 'wompi' is the real gateway wiring point (M15, not
  // implemented yet). Swap happens in PaymentModule, no consumer changes.
  PAYMENT_DRIVER: z.enum(['fake', 'wompi']).default('fake'),
});

/** Runtime config type (from the base object schema). */
export type Env = z.infer<typeof envSchema>;

/** SMTP vars required when NOTIFICATION_DRIVER=smtp (fail-fast at boot, T-109). */
const REQUIRED_SMTP_KEYS = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
] as const;

/** The validated schema + cross-field rules (fail-fast for smtp credentials). */
export const validatedEnvSchema = envSchema.superRefine((env, ctx) => {
  if (env.NOTIFICATION_DRIVER === 'smtp') {
    for (const key of REQUIRED_SMTP_KEYS) {
      if (env[key] === undefined || env[key] === null || env[key] === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when NOTIFICATION_DRIVER=smtp`,
        });
      }
    }
  }
});

/**
 * @nestjs/config `validate` hook. Throws a readable error listing every
 * offending variable so a misconfigured environment fails fast and loud.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = validatedEnvSchema.safeParse(config);
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

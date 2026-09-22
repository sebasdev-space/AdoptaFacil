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
  // S2-08 (M13 organization summary): a document counts toward
  // `documentsExpiringSoon` when it expires within this many days from now.
  // TODO(client): 30 is an initial default (no business decision fixes this
  // threshold yet) — redefine via env, no code change needed.
  DOCUMENTS_EXPIRING_SOON_WINDOW_DAYS: z.coerce.number().int().min(0).max(365).default(30),
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
  // dev/test double (default); 'mercadopago' is the real gateway (recaudo via
  // Checkout Pro preferences). Swap happens in PaymentModule, no consumer
  // changes. Wompi was fully replaced by MercadoPago (client decision) — the
  // gateway never conviven, so this enum has no 'wompi' option any more.
  PAYMENT_DRIVER: z.enum(['fake', 'mercadopago']).default('fake'),
  // MercadoPago credentials — read ONLY from env; never hardcoded, never
  // committed. Optional at the schema level so 'fake' mode boots without them;
  // the refine below enforces their presence when PAYMENT_DRIVER=mercadopago.
  MERCADOPAGO_BASE_URL: z.string().url().default('https://api.mercadopago.com'),
  MERCADOPAGO_PUBLIC_KEY: z.string().min(1).optional(),
  MERCADOPAGO_ACCESS_TOKEN: z.string().min(1).optional(),
  MERCADOPAGO_WEBHOOK_SECRET: z.string().min(1).optional(),
  // S-5-REDISEÑO (M07/RF17, T-057): interval of the repeatable sponsorship
  // billing scan job — opens a new period for sponsorships that just reached
  // their nextBillingAt, and advances the reminder/retry ladder of open
  // periods. Defaults to daily, same cadence as REMINDERS_SCAN_INTERVAL_MS.
  SPONSORSHIP_BILLING_SCAN_INTERVAL_MS: z.coerce.number().int().positive().default(86_400_000),
  // Interval of the payment-status POLLER (checks
  // PaymentPort.getCollectionStatus for every pending attempt). Confirmation
  // is via polling, not the gateway webhook — that webhook is hardcoded for
  // concept_kind='campaign' inside donations/** (Fabián's domain); extending
  // it for 'sponsorship' was out of scope here (confirmed with the user,
  // 2026-08-24). A shorter interval than the daily scan keeps confirmation
  // close to real time without needing that cross-domain change.
  SPONSORSHIP_PAYMENT_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(300_000),
  // Tolerant reminder/retry ladder day-offsets (S-5-REDISEÑO Objetivo 3),
  // ALL measured from a billing period's OWN periodStartedAt — never a fixed
  // calendar date. Product decision taken 2026-08-24 (equipo): several
  // reminders + up to 2 new payment links (3 attempts total) before
  // suspending. These are DEFAULTS, not a rule fixed by the base document —
  // adjustable via env with no code change.
  SPONSORSHIP_REMINDER_DAY_1: z.coerce.number().int().positive().default(5),
  SPONSORSHIP_EXPIRE_ATTEMPT_1_DAY: z.coerce.number().int().positive().default(10),
  SPONSORSHIP_REMINDER_DAY_2: z.coerce.number().int().positive().default(15),
  SPONSORSHIP_EXPIRE_ATTEMPT_2_DAY: z.coerce.number().int().positive().default(20),
  SPONSORSHIP_REMINDER_FINAL_DAY: z.coerce.number().int().positive().default(25),
  SPONSORSHIP_EXPIRE_ATTEMPT_3_DAY: z.coerce.number().int().positive().default(30),
  // T-Google-SignIn (auth): which IdentityPort adapter to bind. `fake` = a
  // deterministic dev/test double that accepts a documented fake token format
  // (default — no real Google account needed); `google` verifies real Google
  // ID tokens via google-auth-library. Swap happens in IdentityModule, no
  // consumer changes (same PAYMENT_DRIVER-style seam). When
  // AUTH_IDENTITY_DRIVER=google, GOOGLE_OAUTH_CLIENT_ID below is REQUIRED
  // (fail-fast, see the refine). The client has not handed over real Google
  // OAuth credentials yet, so `google` cannot be exercised end-to-end until
  // then — same "stub until credentials exist" shape PAYMENT_DRIVER had
  // before T-052/MercadoPago.
  AUTH_IDENTITY_DRIVER: z.enum(['fake', 'google']).default('fake'),
  // Google OAuth 2.0 Client ID (web application type) the ID token's audience
  // must match. Read ONLY from env; never hardcoded, never committed.
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
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

/** MercadoPago vars required when PAYMENT_DRIVER=mercadopago (fail-fast at boot). */
const REQUIRED_MERCADOPAGO_KEYS = [
  'MERCADOPAGO_BASE_URL',
  'MERCADOPAGO_PUBLIC_KEY',
  'MERCADOPAGO_ACCESS_TOKEN',
  'MERCADOPAGO_WEBHOOK_SECRET',
] as const;

/** Google OAuth vars required when AUTH_IDENTITY_DRIVER=google (fail-fast at boot). */
const REQUIRED_GOOGLE_IDENTITY_KEYS = ['GOOGLE_OAUTH_CLIENT_ID'] as const;

/** The validated schema + cross-field rules (fail-fast for smtp/mercadopago credentials). */
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
  if (env.PAYMENT_DRIVER === 'mercadopago') {
    for (const key of REQUIRED_MERCADOPAGO_KEYS) {
      if (env[key] === undefined || env[key] === null || env[key] === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when PAYMENT_DRIVER=mercadopago`,
        });
      }
    }
  }
  if (env.AUTH_IDENTITY_DRIVER === 'google') {
    for (const key of REQUIRED_GOOGLE_IDENTITY_KEYS) {
      if (env[key] === undefined || env[key] === null || env[key] === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when AUTH_IDENTITY_DRIVER=google`,
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

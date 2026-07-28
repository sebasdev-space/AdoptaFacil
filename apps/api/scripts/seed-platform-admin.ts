/**
 * Idempotent seed: creates a PlatformAdmin (+ PlatformSuperAdmin) user so
 * someone can operate the cross-tenant document review queue (RF03,
 * `/plataforma/documentos`) during the pilot — without it, nobody can
 * approve/reject organizations' documents.
 *
 * Usage (from repo root):
 *   pnpm seed:admin
 *   pnpm seed:admin -- admin@refugio.co "S3cur3P@ss" "Admin Piloto"
 *
 * Credentials come from CLI args (email, password, displayName, in that
 * order) or, if omitted, from env vars — NEVER hardcoded:
 *   PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD, PLATFORM_ADMIN_NAME
 * Dev-only defaults when neither is given (CHANGE THESE IN PRODUCTION):
 *   admin@adoptafacil.local / changeme123
 *
 * Idempotent: running it twice never duplicates the user — a second run finds
 * the existing credential by email and just re-asserts (upserts) the platform
 * roles, so a partially-failed prior run is safely completed too.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { Role } from '@adoptafacil/contracts';
import { PasswordService } from '../src/core/auth/password.service';

/** Load the repo-root `.env` (same file the API reads) without adding a
 *  dependency — mirrors the hand-rolled approach already used by
 *  scripts/setup-env.mjs. Never overrides a var already set in the shell. */
function loadRootEnv(): void {
  const envPath = join(__dirname, '..', '..', '..', '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadRootEnv();

// pnpm (unlike npm) forwards a literal `--` through `pnpm run seed:admin -- x y z`
// instead of stripping it — filter it out so positional args land correctly
// regardless of whether this runs via the root wrapper or apps/api directly.
const [argEmail, argPassword, argName] = process.argv.slice(2).filter((arg) => arg !== '--');

const email = (argEmail ?? process.env.PLATFORM_ADMIN_EMAIL ?? 'admin@adoptafacil.local')
  .trim()
  .toLowerCase();
const password = argPassword ?? process.env.PLATFORM_ADMIN_PASSWORD ?? 'changeme123';
const displayName = argName ?? process.env.PLATFORM_ADMIN_NAME ?? 'Platform Admin';

if (password.length < 8) {
  console.error('[seed:admin] La contraseña debe tener al menos 8 caracteres.');
  process.exit(1);
}

/** Both platform roles, so the pilot operator can do everything at the
 *  platform level (review queue, future platform settings, etc.). */
const PLATFORM_ROLES = [Role.PlatformAdmin, Role.PlatformSuperAdmin] as const;

async function main(): Promise<void> {
  // Superuser connection (bypasses RLS) — this is an ops/bootstrap script, not
  // an authenticated request; mirrors the `admin` PrismaClient used by the
  // integration tests' cleanup helper.
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  // Same hashing as normal registration (bcryptjs, cost 12) — reused, not reimplemented.
  const passwords = new PasswordService();

  try {
    const existing = await prisma.authCredential.findUnique({ where: { email } });

    let userId: string;
    let organizationId: string;

    if (existing) {
      console.log(`[seed:admin] Ya existe una credencial para ${email} — no se duplica.`);
      userId = existing.userId;
      organizationId = existing.organizationId;
    } else {
      organizationId = randomUUID();
      userId = randomUUID();
      const passwordHash = await passwords.hash(password);

      await prisma.$transaction(async (tx) => {
        await tx.organization.create({
          data: { id: organizationId, name: `${displayName} (Platform)` },
        });
        await tx.user.create({
          data: { id: userId, organizationId, accountType: 'person', email, displayName },
        });
        await tx.authCredential.create({
          data: { userId, organizationId, accountType: 'person', email, passwordHash },
        });
      });
      console.log(`[seed:admin] Usuario creado: ${email} (userId=${userId}).`);
    }

    // Upsert (not create): a second run never duplicates a role row, and a
    // partially-failed prior run (e.g. credential created but roles missing)
    // gets completed safely.
    for (const role of PLATFORM_ROLES) {
      await prisma.userRole.upsert({
        where: { organizationId_userId_role: { organizationId, userId, role } },
        create: { organizationId, userId, role },
        update: {},
      });
    }
    console.log(`[seed:admin] Roles asegurados para ${email}: ${PLATFORM_ROLES.join(', ')}.`);
    console.log('[seed:admin] Listo. Inicia sesión y visita /plataforma/documentos.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('[seed:admin] Error:', error);
  process.exit(1);
});

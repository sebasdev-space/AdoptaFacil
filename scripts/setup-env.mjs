// Cross-platform .env bootstrap.
//
// Creates .env from .env.example, GUARANTEEING UTF-8 (no BOM) regardless of the
// shell. This exists because PowerShell's `>`, `Out-File` and `Set-Content`
// default to UTF-16LE+BOM, which Prisma's dotenv parser cannot read — the file
// "loads" but every variable resolves to (not available). Always create .env
// with `pnpm setup:env` instead of shell redirects.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const examplePath = join(root, '.env.example');
const targetPath = join(root, '.env');

if (!existsSync(examplePath)) {
  console.error('[setup:env] .env.example not found at repo root.');
  process.exit(1);
}

if (existsSync(targetPath)) {
  console.log('[setup:env] .env already exists — leaving it untouched.');
  process.exit(0);
}

// Read + write as UTF-8 (Node never writes a BOM here).
const contents = readFileSync(examplePath, 'utf8');
writeFileSync(targetPath, contents, { encoding: 'utf8' });
console.log('[setup:env] Created .env from .env.example (UTF-8, no BOM).');

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Load the repo-root .env into process.env for integration tests, WITHOUT
 * overriding variables already present (so CI-provided values win). No dotenv
 * dependency — a tiny KEY=VALUE parser that also strips surrounding quotes.
 */
const envPath = join(__dirname, '..', '..', '..', '.env');
if (existsSync(envPath)) {
  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

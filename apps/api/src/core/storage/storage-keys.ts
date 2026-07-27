import { randomUUID } from 'node:crypto';
import type { StorageVisibility } from './storage.port';

/**
 * Storage KEY scheme + path-safety helpers (T-108). The key is the ONLY thing
 * consumers persist (`storageRef`); its shape lives here so adapters and the
 * serve endpoint agree, and NOTHING disk-specific leaks to the business modules.
 *
 * Key = `<visibility>/<organizationId>/<uuid>-<safeName>`, e.g.
 *   private/6f…/2a…-demanda.pdf   (legal document — served behind JWT+RBAC)
 *   public/6f…/9c…-firu.jpg       (animal photo — served openly)
 *
 * The uuid makes keys UNGUESSABLE; the visibility prefix lets the serve endpoint
 * pick the right access policy; the org segment scopes files per tenant on disk.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sanitize a filename to a safe key segment (no separators, lowercase). */
export function safeName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? 'file';
  return (
    base
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'file'
  );
}

/** Build a fresh, unguessable storage key for an org asset. */
export function buildStorageKey(
  visibility: StorageVisibility,
  organizationId: string,
  filename: string,
): string {
  return `${visibility}/${organizationId}/${randomUUID()}-${safeName(filename)}`;
}

/**
 * Reject any key that could escape the tenant root (path traversal, absolute
 * paths, drive letters, NUL, backslashes). Throws — never returns a bad key.
 */
export function assertSafeRelativeKey(key: string): void {
  if (
    !key ||
    key.includes('..') ||
    key.includes('\\') ||
    key.includes('\0') ||
    key.includes(':') ||
    key.startsWith('/')
  ) {
    throw new Error('Unsafe storage key');
  }
}

/** Parse + validate a key. Returns null when malformed/unsafe (never throws). */
export function parseStorageKey(
  key: string,
): { visibility: StorageVisibility; organizationId: string } | null {
  try {
    assertSafeRelativeKey(key);
  } catch {
    return null;
  }
  const segments = key.split('/');
  if (segments.length < 3) {
    return null;
  }
  const [visibility, organizationId, ...rest] = segments;
  if (visibility !== 'public' && visibility !== 'private') {
    return null;
  }
  if (!UUID_RE.test(organizationId)) {
    return null;
  }
  if (rest.join('/').trim() === '') {
    return null;
  }
  return { visibility, organizationId };
}

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
};

/** Best-effort content type from the key's file extension (used on read). */
export function contentTypeFromKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPE_BY_EXT[ext] ?? 'application/octet-stream';
}

/** Content types accepted on upload (images + PDF). */
export const ALLOWED_CONTENT_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
];

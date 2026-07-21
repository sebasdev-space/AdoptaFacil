// Pure validators for the organization profile form (no React). Mirrors the
// style of features/auth/validation.ts: each returns an error string or
// undefined. Fields are optional — empty is valid.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateOptionalEmail(value: string): string | undefined {
  const v = value.trim();
  if (!v) return undefined;
  return EMAIL_RE.test(v) ? undefined : 'Correo inválido.';
}

export function validateOptionalUrl(value: string): string | undefined {
  const v = value.trim();
  if (!v) return undefined;
  try {
    new URL(v);
    return undefined;
  } catch {
    return 'Debe ser una URL válida (https://…).';
  }
}

export function validateOptionalSlug(value: string): string | undefined {
  const v = value.trim();
  if (!v) return undefined;
  if (v.length > 63) return 'Máximo 63 caracteres.';
  return SLUG_RE.test(v) ? undefined : 'Solo minúsculas, números y guiones (ej. mi-refugio).';
}

/** Split a textarea of one-URL-per-line into a trimmed, non-empty list. */
export function parseUrlLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

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
  // Mismo texto que el mensaje del regex en el backend
  // (apps/api/src/modules/org/org.schemas.ts) — con el fix de
  // apiErrorFromResponse ese mensaje SÍ puede llegar a la UI si algo se
  // escapa de esta validación, así que ambos deben decir lo mismo.
  return SLUG_RE.test(v)
    ? undefined
    : 'Solo se permiten letras minúsculas, números y guiones — sin espacios ni tildes.';
}

/**
 * "Fundación Huellas" → "fundacion-huellas" — auto-sugerencia mostrada junto
 * al error de formato del campo "Dirección de tu portal público" (antes
 * llamado "slug"), para que el usuario no tenga que adivinar la versión
 * válida. Quita tildes/diacríticos (incluida la ñ, que en NFD se descompone a
 * "n" + tilde combinante), pasa a minúsculas y colapsa cualquier otro
 * caracter en un solo guion.
 */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

/** Split a textarea of one-URL-per-line into a trimmed, non-empty list. */
export function parseUrlLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

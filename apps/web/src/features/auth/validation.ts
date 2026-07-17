/**
 * Pure, framework-free form validators for the auth screens. Each returns a
 * human-readable (es-CO) error string, or `undefined` when the value is valid.
 * Keeping them pure makes them trivial to unit-test and reuse across forms.
 */

export type FieldError = string | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 8;

export function validateRequired(value: string, label = 'Este campo'): FieldError {
  return value.trim().length === 0 ? `${label} es obligatorio.` : undefined;
}

export function validateEmail(value: string): FieldError {
  if (value.trim().length === 0) return 'El correo es obligatorio.';
  return EMAIL_RE.test(value.trim()) ? undefined : 'Ingresa un correo válido.';
}

export function validatePassword(value: string): FieldError {
  if (value.length === 0) return 'La contraseña es obligatoria.';
  return value.length < MIN_PASSWORD_LENGTH
    ? `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`
    : undefined;
}

export function validatePasswordConfirmation(password: string, confirmation: string): FieldError {
  if (confirmation.length === 0) return 'Confirma tu contraseña.';
  return password !== confirmation ? 'Las contraseñas no coinciden.' : undefined;
}

/** Colombian NIT: 9–10 digits, optionally with a check digit (e.g. 900123456-7). */
export function validateNit(value: string): FieldError {
  if (value.trim().length === 0) return 'El NIT es obligatorio.';
  return /^\d{9,10}(-?\d)?$/.test(value.trim())
    ? undefined
    : 'Ingresa un NIT válido (solo dígitos).';
}

/** Optional phone: when present, must look like a phone number. */
export function validateOptionalPhone(value: string): FieldError {
  if (value.trim().length === 0) return undefined;
  return /^[\d\s()+-]{7,15}$/.test(value.trim()) ? undefined : 'Ingresa un teléfono válido.';
}

/** Drop `undefined` entries and report whether any error remains. */
export function collectErrors<T extends Record<string, FieldError>>(
  errors: T,
): { errors: Partial<Record<keyof T, string>>; isValid: boolean } {
  const filtered: Partial<Record<keyof T, string>> = {};
  for (const key of Object.keys(errors) as (keyof T)[]) {
    const message = errors[key];
    if (message) filtered[key] = message;
  }
  return { errors: filtered, isValid: Object.keys(filtered).length === 0 };
}

import { describe, expect, it } from 'vitest';
import {
  collectErrors,
  validateEmail,
  validateNit,
  validateOptionalPhone,
  validatePassword,
  validatePasswordConfirmation,
  validateRequired,
} from './validation';

describe('auth validation', () => {
  it('validates required fields', () => {
    expect(validateRequired('', 'El nombre')).toBe('El nombre es obligatorio.');
    expect(validateRequired('   ')).toBeDefined();
    expect(validateRequired('Fido')).toBeUndefined();
  });

  it('validates email format', () => {
    expect(validateEmail('')).toBeDefined();
    expect(validateEmail('not-an-email')).toBe('Ingresa un correo válido.');
    expect(validateEmail('user@example.com')).toBeUndefined();
  });

  it('enforces a minimum password length', () => {
    expect(validatePassword('')).toBeDefined();
    expect(validatePassword('short')).toContain('al menos');
    expect(validatePassword('longenough')).toBeUndefined();
  });

  it('checks password confirmation matches', () => {
    expect(validatePasswordConfirmation('abcd1234', '')).toBeDefined();
    expect(validatePasswordConfirmation('abcd1234', 'different')).toBe(
      'Las contraseñas no coinciden.',
    );
    expect(validatePasswordConfirmation('abcd1234', 'abcd1234')).toBeUndefined();
  });

  it('validates a Colombian NIT (digits, optional check digit)', () => {
    expect(validateNit('')).toBeDefined();
    expect(validateNit('abc')).toBeDefined();
    expect(validateNit('900123456')).toBeUndefined();
    expect(validateNit('900123456-7')).toBeUndefined();
  });

  it('treats an empty optional phone as valid but rejects garbage', () => {
    expect(validateOptionalPhone('')).toBeUndefined();
    expect(validateOptionalPhone('3001234567')).toBeUndefined();
    expect(validateOptionalPhone('abc')).toBeDefined();
  });

  it('collects only the failing fields', () => {
    const { errors, isValid } = collectErrors({
      a: undefined,
      b: 'boom',
      c: undefined,
    });
    expect(isValid).toBe(false);
    expect(errors).toEqual({ b: 'boom' });

    const ok = collectErrors({ a: undefined });
    expect(ok.isValid).toBe(true);
    expect(ok.errors).toEqual({});
  });
});

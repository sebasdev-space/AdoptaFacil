import { validateEnv } from './env.validation';

/** Minimal set of the always-required vars (no hardcoded secrets — dummy URLs). */
const BASE = {
  DATABASE_URL: 'postgresql://u:p@localhost:5433/db?schema=public',
  DATABASE_URL_APP: 'postgresql://a:a@localhost:5433/db?schema=public',
  REDIS_URL: 'redis://localhost:6379',
};

describe('validateEnv — NOTIFICATION_DRIVER fail-fast (T-109)', () => {
  it('boots with the default log driver (no SMTP vars needed)', () => {
    expect(() => validateEnv({ ...BASE })).not.toThrow();
    expect(validateEnv({ ...BASE }).NOTIFICATION_DRIVER).toBe('log');
  });

  it('fails fast when driver=smtp and credentials are missing', () => {
    expect(() => validateEnv({ ...BASE, NOTIFICATION_DRIVER: 'smtp' })).toThrow(/SMTP_HOST/);
  });

  it('accepts driver=smtp when all SMTP_* vars are present', () => {
    expect(() =>
      validateEnv({
        ...BASE,
        NOTIFICATION_DRIVER: 'smtp',
        SMTP_HOST: 'smtp.example.test',
        SMTP_PORT: '465',
        SMTP_USER: 'u@example.test',
        SMTP_PASS: 'secret',
        SMTP_FROM: 'no-reply@example.test',
      }),
    ).not.toThrow();
  });
});

describe('validateEnv — PAYMENT_DRIVER fail-fast (T-060)', () => {
  it('boots with the default fake driver (no WOMPI_* vars needed)', () => {
    expect(() => validateEnv({ ...BASE })).not.toThrow();
    expect(validateEnv({ ...BASE }).PAYMENT_DRIVER).toBe('fake');
  });

  it('fails fast when driver=wompi and credentials are missing', () => {
    expect(() => validateEnv({ ...BASE, PAYMENT_DRIVER: 'wompi' })).toThrow(/WOMPI_BASE_URL/);
  });

  it('accepts driver=wompi when all WOMPI_* vars are present', () => {
    expect(() =>
      validateEnv({
        ...BASE,
        PAYMENT_DRIVER: 'wompi',
        WOMPI_BASE_URL: 'https://sandbox.wompi.co/v1',
        WOMPI_PUBLIC_KEY: 'pub_test_dummy',
        WOMPI_PRIVATE_KEY: 'prv_test_dummy',
        WOMPI_EVENTS_SECRET: 'test_events_dummy',
      }),
    ).not.toThrow();
  });
});

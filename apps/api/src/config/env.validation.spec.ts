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

describe('validateEnv — PAYMENT_DRIVER fail-fast (T-052)', () => {
  it('boots with the default fake driver (no MERCADOPAGO_* vars needed)', () => {
    expect(() => validateEnv({ ...BASE })).not.toThrow();
    expect(validateEnv({ ...BASE }).PAYMENT_DRIVER).toBe('fake');
  });

  it('fails fast when driver=mercadopago and credentials are missing', () => {
    expect(() => validateEnv({ ...BASE, PAYMENT_DRIVER: 'mercadopago' })).toThrow(
      /MERCADOPAGO_PUBLIC_KEY/,
    );
  });

  it('accepts driver=mercadopago when all MERCADOPAGO_* vars are present', () => {
    expect(() =>
      validateEnv({
        ...BASE,
        PAYMENT_DRIVER: 'mercadopago',
        MERCADOPAGO_BASE_URL: 'https://api.mercadopago.com',
        MERCADOPAGO_PUBLIC_KEY: 'TEST-pub-dummy',
        MERCADOPAGO_ACCESS_TOKEN: 'TEST-token-dummy',
        MERCADOPAGO_WEBHOOK_SECRET: 'test_webhook_secret_dummy',
      }),
    ).not.toThrow();
  });
});

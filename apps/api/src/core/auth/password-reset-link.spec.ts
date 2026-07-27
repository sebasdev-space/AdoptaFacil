import { buildPasswordResetLink } from './password-reset-link';

describe('buildPasswordResetLink (T-110)', () => {
  it('builds {base}/reset-password?token=… from WEB_BASE_URL', () => {
    expect(buildPasswordResetLink('http://localhost:5173', 'abc123')).toBe(
      'http://localhost:5173/reset-password?token=abc123',
    );
  });

  it('trims a trailing slash on the base URL (no double slash)', () => {
    expect(buildPasswordResetLink('https://app.adoptafacil.co/', 'tok')).toBe(
      'https://app.adoptafacil.co/reset-password?token=tok',
    );
  });

  it('URL-encodes the token', () => {
    expect(buildPasswordResetLink('https://x.test', 'a b+c/d')).toBe(
      'https://x.test/reset-password?token=a%20b%2Bc%2Fd',
    );
  });
});

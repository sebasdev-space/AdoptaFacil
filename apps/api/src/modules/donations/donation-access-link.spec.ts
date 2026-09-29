import { buildDonationAccessLink } from './donation-access-link';

describe('buildDonationAccessLink', () => {
  it('builds the comprobante link with the token in the query string', () => {
    expect(buildDonationAccessLink('https://app.adoptafacil.co', 'tok123')).toBe(
      'https://app.adoptafacil.co/donaciones/comprobante?token=tok123',
    );
  });

  it('strips a trailing slash from webBaseUrl (same convention as buildPasswordResetLink)', () => {
    expect(buildDonationAccessLink('https://app.adoptafacil.co/', 'tok123')).toBe(
      'https://app.adoptafacil.co/donaciones/comprobante?token=tok123',
    );
  });

  it('URL-encodes special characters in the token defensively', () => {
    const token = 'a+b/c=d';
    const link = buildDonationAccessLink('https://app.adoptafacil.co', token);
    expect(link).toBe(
      `https://app.adoptafacil.co/donaciones/comprobante?token=${encodeURIComponent(token)}`,
    );
  });
});

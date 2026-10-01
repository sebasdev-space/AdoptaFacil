import { isDueForRefresh } from './mercadopago-token-refresh.window';

describe('isDueForRefresh (T-OAuth-Connect)', () => {
  const now = new Date('2026-09-30T00:00:00.000Z');

  it('NOT due when expiry is well beyond the window', () => {
    const expiresAt = new Date('2027-01-01T00:00:00.000Z'); // ~93 days out
    expect(isDueForRefresh(expiresAt, now, 15)).toBe(false);
  });

  it('due when expiry falls exactly on the window boundary', () => {
    const expiresAt = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
    expect(isDueForRefresh(expiresAt, now, 15)).toBe(true);
  });

  it('due when expiry is a day inside the window', () => {
    const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    expect(isDueForRefresh(expiresAt, now, 15)).toBe(true);
  });

  it('NOT due one millisecond outside the window', () => {
    const expiresAt = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000 + 1);
    expect(isDueForRefresh(expiresAt, now, 15)).toBe(false);
  });

  it('due when the token already expired (never gives up on a lapsed token)', () => {
    const expiresAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    expect(isDueForRefresh(expiresAt, now, 15)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { InMemoryTokenStore, tokensFromContract } from './token-store';

describe('InMemoryTokenStore', () => {
  it('stores, reads and clears tokens', () => {
    const store = new InMemoryTokenStore();
    expect(store.get()).toBeNull();
    expect(store.getAccessToken()).toBeNull();
    expect(store.getRefreshToken()).toBeNull();

    store.set({ accessToken: 'a', refreshToken: 'r', expiresAt: null });
    expect(store.getAccessToken()).toBe('a');
    expect(store.getRefreshToken()).toBe('r');

    store.clear();
    expect(store.get()).toBeNull();
    expect(store.getAccessToken()).toBeNull();
  });

  it('reports expiry using the absolute timestamp and skew', () => {
    const store = new InMemoryTokenStore();
    store.set({ accessToken: 'a', refreshToken: 'r', expiresAt: 10_000 });

    expect(store.isAccessTokenExpired(1_000, 0)).toBe(false);
    // Within the 5s skew window counts as expired.
    expect(store.isAccessTokenExpired(9_000, 5_000)).toBe(true);
    expect(store.isAccessTokenExpired(20_000, 0)).toBe(true);
  });

  it('never reports expiry when the expiry is unknown', () => {
    const store = new InMemoryTokenStore();
    store.set({ accessToken: 'a', refreshToken: 'r', expiresAt: null });
    expect(store.isAccessTokenExpired(Number.MAX_SAFE_INTEGER)).toBe(false);
  });

  it('converts contract tokens to an absolute expiry', () => {
    const stored = tokensFromContract(
      { accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 60 },
      1_000,
    );
    expect(stored).toEqual({ accessToken: 'a', refreshToken: 'r', expiresAt: 61_000 });
  });

  it('leaves expiry null when the contract gives no lifetime', () => {
    const stored = tokensFromContract(
      { accessToken: 'a', refreshToken: 'r', tokenType: 'Bearer', expiresIn: 0 },
      1_000,
    );
    expect(stored.expiresAt).toBeNull();
  });
});

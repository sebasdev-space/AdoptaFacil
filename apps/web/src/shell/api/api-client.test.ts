import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from './api-client';
import { ApiError } from './api-error';
import type { AuthTokens } from './auth-contract';
import { InMemoryTokenStore } from './token-store';

const NEW_TOKENS: AuthTokens = {
  accessToken: 'new-access',
  refreshToken: 'new-refresh',
  expiresIn: 900,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function authHeader(init: RequestInit | undefined): string | null {
  return new Headers(init?.headers).get('Authorization');
}

function seededStore() {
  const store = new InMemoryTokenStore();
  store.set({ accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: null });
  return store;
}

describe('ApiClient refresh interceptor', () => {
  it('refreshes on 401 and transparently retries the original request', async () => {
    const tokenStore = seededStore();
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
    const refreshTokens = vi.fn().mockResolvedValue(NEW_TOKENS);
    const onTokensRefreshed = vi.fn();

    const client = new ApiClient({
      baseUrl: 'http://api.test',
      tokenStore,
      refreshTokens,
      onTokensRefreshed,
      fetchFn,
    });

    const result = await client.request<{ ok: boolean }>('/protected');

    expect(result).toEqual({ ok: true });
    expect(refreshTokens).toHaveBeenCalledTimes(1);
    expect(refreshTokens).toHaveBeenCalledWith('old-refresh');
    expect(fetchFn).toHaveBeenCalledTimes(2);
    // First attempt used the old token, the retry used the refreshed one.
    expect(authHeader(fetchFn.mock.calls[0]?.[1])).toBe('Bearer old-access');
    expect(authHeader(fetchFn.mock.calls[1]?.[1])).toBe('Bearer new-access');
    expect(tokenStore.getAccessToken()).toBe('new-access');
    expect(onTokensRefreshed).toHaveBeenCalledWith(NEW_TOKENS);
  });

  it('clears the session and notifies when the refresh fails', async () => {
    const tokenStore = seededStore();
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: 'expired' }, 401));
    const refreshTokens = vi
      .fn()
      .mockRejectedValue(new ApiError(401, 'invalid_refresh_token', 'bad refresh'));
    const onSessionExpired = vi.fn();

    const client = new ApiClient({
      baseUrl: 'http://api.test',
      tokenStore,
      refreshTokens,
      onSessionExpired,
      fetchFn,
    });

    await expect(client.request('/protected')).rejects.toMatchObject({
      code: 'session_expired',
    });
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(tokenStore.get()).toBeNull();
    // No retry after a failed refresh.
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('proactively refreshes a known-expired access token before sending', async () => {
    const tokenStore = new InMemoryTokenStore();
    tokenStore.set({ accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: 1_000 });
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }, 200));
    const refreshTokens = vi.fn().mockResolvedValue(NEW_TOKENS);

    const client = new ApiClient({
      baseUrl: 'http://api.test',
      tokenStore,
      refreshTokens,
      fetchFn,
      now: () => 10_000, // past expiry
    });

    await client.request('/protected');

    expect(refreshTokens).toHaveBeenCalledTimes(1);
    // Only one network call — the request went out already authenticated.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(authHeader(fetchFn.mock.calls[0]?.[1])).toBe('Bearer new-access');
  });

  it('refreshes only once for concurrent 401s (single-flight)', async () => {
    const tokenStore = seededStore();
    const fetchFn = vi.fn<typeof fetch>().mockImplementation((_url, init) => {
      const ok = authHeader(init) === 'Bearer new-access';
      return Promise.resolve(
        jsonResponse(ok ? { ok: true } : { error: 'expired' }, ok ? 200 : 401),
      );
    });
    const refreshTokens = vi.fn().mockResolvedValue(NEW_TOKENS);

    const client = new ApiClient({
      baseUrl: 'http://api.test',
      tokenStore,
      refreshTokens,
      fetchFn,
    });

    const [a, b] = await Promise.all([
      client.request<{ ok: boolean }>('/a'),
      client.request<{ ok: boolean }>('/b'),
    ]);

    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    // Both requests shared a single refresh.
    expect(refreshTokens).toHaveBeenCalledTimes(1);
  });

  it('surfaces a 401 and expires the session when there is no refresh token', async () => {
    const tokenStore = new InMemoryTokenStore();
    tokenStore.set({ accessToken: 'old-access', refreshToken: '', expiresAt: null });
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: 'nope' }, 401));
    const refreshTokens = vi.fn();
    const onSessionExpired = vi.fn();

    const client = new ApiClient({
      baseUrl: 'http://api.test',
      tokenStore,
      refreshTokens,
      onSessionExpired,
      fetchFn,
    });

    await expect(client.request('/protected')).rejects.toBeInstanceOf(ApiError);
    expect(refreshTokens).not.toHaveBeenCalled();
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('attaches no Authorization header when there is no session', async () => {
    const tokenStore = new InMemoryTokenStore();
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }, 200));

    const client = new ApiClient({
      baseUrl: 'http://api.test',
      tokenStore,
      refreshTokens: vi.fn(),
      fetchFn,
    });

    await client.request('/public');
    expect(authHeader(fetchFn.mock.calls[0]?.[1])).toBeNull();
  });
});

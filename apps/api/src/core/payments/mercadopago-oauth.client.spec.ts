import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';
import {
  MercadoPagoOAuthClient,
  MercadoPagoOAuthError,
  type MercadoPagoOAuthFetch,
} from './mercadopago-oauth.client';

const ENV: Record<string, unknown> = {
  MERCADOPAGO_BASE_URL: 'https://api.mercadopago.com',
  MERCADOPAGO_APP_ID: 'app-id-123',
  MERCADOPAGO_CLIENT_SECRET: 'client-secret-xyz',
  STORAGE_PUBLIC_BASE_URL: 'https://api.adoptafacil.test',
};

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService<Env, true> {
  const merged = { ...ENV, ...overrides };
  return { get: (key: string) => merged[key] } as unknown as ConfigService<Env, true>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('MercadoPagoOAuthClient — buildAuthorizeUrl (T-OAuth-Connect)', () => {
  it('builds the Colombia authorize URL with client_id, redirect_uri, state and scope=offline_access', () => {
    const client = new MercadoPagoOAuthClient(makeConfig());
    const url = new URL(client.buildAuthorizeUrl('signed-state-token'));

    expect(url.origin + url.pathname).toBe('https://auth.mercadopago.com.co/authorization');
    expect(url.searchParams.get('client_id')).toBe('app-id-123');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('platform_id')).toBe('mp');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://api.adoptafacil.test/org/mercadopago/callback',
    );
    expect(url.searchParams.get('state')).toBe('signed-state-token');
    // REQUIRED to get a refresh_token back — its absence silently yields a
    // non-renewable token (verified live against the real sandbox).
    expect(url.searchParams.get('scope')).toBe('offline_access');
  });

  it('falls back to the localhost dev redirect_uri when STORAGE_PUBLIC_BASE_URL is unset', () => {
    const client = new MercadoPagoOAuthClient(makeConfig({ STORAGE_PUBLIC_BASE_URL: undefined }));
    expect(client.getRedirectUri()).toBe('http://localhost:3000/org/mercadopago/callback');
  });

  it('an explicit MERCADOPAGO_OAUTH_REDIRECT_URI always wins', () => {
    const client = new MercadoPagoOAuthClient(
      makeConfig({ MERCADOPAGO_OAUTH_REDIRECT_URI: 'https://custom.test/cb' }),
    );
    expect(client.getRedirectUri()).toBe('https://custom.test/cb');
    expect(
      client.buildAuthorizeUrl('s').includes('redirect_uri=https%3A%2F%2Fcustom.test%2Fcb'),
    ).toBe(true);
  });
});

describe('MercadoPagoOAuthClient — exchangeCode (T-OAuth-Connect)', () => {
  it('POSTs /oauth/token with the exact authorization_code grant body MercadoPago expects', async () => {
    const fetchFn = jest.fn<ReturnType<MercadoPagoOAuthFetch>, Parameters<MercadoPagoOAuthFetch>>(
      () =>
        Promise.resolve(
          jsonResponse({
            access_token: 'APP_USR-access-tok',
            refresh_token: 'TG-refresh-tok',
            user_id: 123456,
            public_key: 'APP_USR-pub',
            expires_in: 15_552_000,
          }),
        ),
    ) as unknown as MercadoPagoOAuthFetch;
    const client = new MercadoPagoOAuthClient(makeConfig(), fetchFn);

    const result = await client.exchangeCode('the-auth-code', 'the-state-jwt');

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchFn as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/oauth/token');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      client_id: 'app-id-123',
      client_secret: 'client-secret-xyz',
      grant_type: 'authorization_code',
      code: 'the-auth-code',
      redirect_uri: 'https://api.adoptafacil.test/org/mercadopago/callback',
      state: 'the-state-jwt',
    });

    expect(result.access_token).toBe('APP_USR-access-tok');
    expect(result.refresh_token).toBe('TG-refresh-tok');
    expect(result.user_id).toBe(123456);
  });

  it('throws MercadoPagoOAuthError (never the raw body) on a non-2xx response', async () => {
    const fetchFn = jest.fn<ReturnType<MercadoPagoOAuthFetch>, Parameters<MercadoPagoOAuthFetch>>(
      () => Promise.resolve(jsonResponse({ error: 'invalid_grant', message: 'code expired' }, 400)),
    ) as unknown as MercadoPagoOAuthFetch;
    const client = new MercadoPagoOAuthClient(makeConfig(), fetchFn);

    await expect(client.exchangeCode('bad-code', 'state')).rejects.toThrow(MercadoPagoOAuthError);
  });
});

describe('MercadoPagoOAuthClient — refreshToken (T-OAuth-Connect)', () => {
  it('POSTs /oauth/token with the exact refresh_token grant body MercadoPago expects', async () => {
    const fetchFn = jest.fn<ReturnType<MercadoPagoOAuthFetch>, Parameters<MercadoPagoOAuthFetch>>(
      () =>
        Promise.resolve(jsonResponse({ access_token: 'new-access', refresh_token: 'new-refresh' })),
    ) as unknown as MercadoPagoOAuthFetch;
    const client = new MercadoPagoOAuthClient(makeConfig(), fetchFn);

    const result = await client.refreshToken('old-refresh-token');

    const [url, init] = (fetchFn as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/oauth/token');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      client_id: 'app-id-123',
      client_secret: 'client-secret-xyz',
      grant_type: 'refresh_token',
      refresh_token: 'old-refresh-token',
    });
    expect(result.access_token).toBe('new-access');
  });
});

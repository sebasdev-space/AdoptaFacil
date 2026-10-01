import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation';

/** Injectable fetch surface so tests run with ZERO network — same convention
 *  as `MercadoPagoPaymentAdapter`'s `MercadoPagoFetch`. */
export type MercadoPagoOAuthFetch = typeof fetch;

/**
 * MercadoPago's own Colombia-specific OAuth authorize host — verified LIVE
 * against the real sandbox (not the generic `api.mercadopago.com`, which only
 * serves the token exchange below). Not env-configurable: this is a fixed
 * MercadoPago endpoint, not a per-environment setting.
 */
const AUTHORIZE_BASE_URL = 'https://auth.mercadopago.com.co/authorization';

/** Response shape of `POST /oauth/token` (both the authorization_code and
 *  refresh_token grants return this same shape). `expires_in` is OPTIONAL in
 *  this type on purpose: it may be absent depending on the exact grant/app
 *  configuration, and when present it is authoritative over the ~180-day
 *  figure verified empirically (see the caller in `mercadopago-connect.service.ts`). */
export interface MercadoPagoOAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  /** Seconds until expiry, when MercadoPago includes it. */
  expires_in?: number;
  user_id?: number | string;
  public_key?: string;
  token_type?: string;
  scope?: string;
}

/** Thrown when the token endpoint responds with a non-2xx status. The message
 *  is for SERVER-SIDE logs only — callers must never forward it verbatim to a
 *  public redirect (see `mercadopago-connect.controller.ts`'s callback). */
export class MercadoPagoOAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'MercadoPagoOAuthError';
  }
}

/**
 * HTTP-only wrapper around MercadoPago's OAuth "connect your account" dance
 * (Split de Pagos 1:1, T-OAuth-Connect) — builds the authorize URL and calls
 * `POST /oauth/token` for both the authorization_code and refresh_token
 * grants. Pure transport: it never touches the database or signs/verifies the
 * `state` JWT (that is `MercadoPagoConnectService`'s job) — same separation of
 * concerns as `MercadoPagoPaymentAdapter` (transport) vs. the business
 * services that call it.
 *
 * Credentials (`MERCADOPAGO_APP_ID`/`MERCADOPAGO_CLIENT_SECRET`) come
 * EXCLUSIVELY from env — never hardcoded, never logged. `redirect_uri`
 * resolution mirrors `MercadoPagoPaymentAdapter`'s `publicBaseUrl`/
 * `webBaseUrl` optionality: an explicit `MERCADOPAGO_OAUTH_REDIRECT_URI` wins,
 * otherwise it falls back to `${STORAGE_PUBLIC_BASE_URL}/org/mercadopago/callback`,
 * and finally to a hardcoded localhost dev default.
 */
@Injectable()
export class MercadoPagoOAuthClient {
  private readonly logger = new Logger('MercadoPagoOAuthClient');
  private readonly appId: string;
  private readonly clientSecret: string;
  private readonly tokenUrl: string;
  private readonly redirectUri: string;

  constructor(
    config: ConfigService<Env, true>,
    // `@Optional()` is REQUIRED here: unlike `MercadoPagoPaymentAdapter` (only
    // ever built by hand via a factory in payment.module.ts, so Nest never
    // touches its constructor), THIS class is registered directly in
    // `providers: [MercadoPagoOAuthClient]` (payments.module.ts) — Nest's
    // reflection-based DI then tries to auto-resolve EVERY constructor param,
    // and `MercadoPagoOAuthFetch` (a bare type alias, no runtime value)
    // reflects to a `Function` design-type with no matching provider, which
    // throws at boot without `@Optional()` (confirmed via `test:rls`: it broke
    // every integration spec that builds the full AppModule). With
    // `@Optional()`, Nest injects `undefined` when it can't resolve the
    // token, and the default value below applies exactly as in a plain `new
    // MercadoPagoOAuthClient(config)` call (tests still override it directly).
    @Optional() private readonly fetchFn: MercadoPagoOAuthFetch = globalThis.fetch.bind(globalThis),
  ) {
    // Non-null casts: env validation (fail-fast) guarantees these when
    // PAYMENT_DRIVER=mercadopago — the only driver under which this class is
    // ever exercised for real (see payments.module.ts wiring).
    this.appId = config.get('MERCADOPAGO_APP_ID', { infer: true }) as string;
    this.clientSecret = config.get('MERCADOPAGO_CLIENT_SECRET', { infer: true }) as string;
    const baseUrl = (config.get('MERCADOPAGO_BASE_URL', { infer: true }) as string).replace(
      /\/$/,
      '',
    );
    this.tokenUrl = `${baseUrl}/oauth/token`;

    const explicitRedirect = config.get('MERCADOPAGO_OAUTH_REDIRECT_URI', { infer: true }) as
      string | undefined;
    const publicBaseUrl = config.get('STORAGE_PUBLIC_BASE_URL', { infer: true }) as
      string | undefined;
    this.redirectUri =
      explicitRedirect ??
      (publicBaseUrl
        ? `${publicBaseUrl.replace(/\/$/, '')}/org/mercadopago/callback`
        : 'http://localhost:3000/org/mercadopago/callback');
  }

  /**
   * Build the URL the frontend navigates the browser to
   * (`window.location.href = authorizeUrl`, full page navigation — never a
   * fetch). `scope=offline_access` is REQUIRED to get a `refresh_token` back;
   * omitting it silently yields a non-renewable token (verified live).
   */
  buildAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.appId,
      response_type: 'code',
      platform_id: 'mp',
      redirect_uri: this.redirectUri,
      state,
      scope: 'offline_access',
    });
    return `${AUTHORIZE_BASE_URL}?${params.toString()}`;
  }

  /** The resolved redirect_uri (exposed so the connect service can log/echo
   *  it without recomputing the same fallback logic twice). */
  getRedirectUri(): string {
    return this.redirectUri;
  }

  /** Exchange the authorization `code` (+ the same `state` that was sent to
   *  MercadoPago) for a token pair. */
  async exchangeCode(code: string, state: string): Promise<MercadoPagoOAuthTokenResponse> {
    return this.postToken({
      client_id: this.appId,
      client_secret: this.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      state,
    });
  }

  /** Renew a token pair before it lapses (~180 days). */
  async refreshToken(refreshToken: string): Promise<MercadoPagoOAuthTokenResponse> {
    return this.postToken({
      client_id: this.appId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  }

  private async postToken(body: Record<string, string>): Promise<MercadoPagoOAuthTokenResponse> {
    const response = await this.fetchFn(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      // Never include the response body verbatim in a message a caller might
      // surface publicly (it can echo back client_secret-adjacent context) —
      // just the grant type and status; the full body is logged HERE, server
      // side, for diagnosis only.
      const text = await response.text().catch(() => '');
      this.logger.warn(
        `MercadoPago OAuth token endpoint returned ${response.status} for grant_type=${body.grant_type}: ${text}`,
      );
      throw new MercadoPagoOAuthError(
        `MercadoPago OAuth token exchange failed (grant_type=${body.grant_type})`,
        response.status,
      );
    }
    return (await response.json()) as MercadoPagoOAuthTokenResponse;
  }
}

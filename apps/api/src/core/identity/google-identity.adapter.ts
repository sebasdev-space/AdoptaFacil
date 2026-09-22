import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import type { IdentityClaims, IdentityPort } from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';

/**
 * Real Google Sign-In verifier (T-Google-SignIn), bound only when
 * `AUTH_IDENTITY_DRIVER=google`. Verifies the ID token's signature, issuer,
 * expiry AND audience (must match `GOOGLE_OAUTH_CLIENT_ID`) via
 * `google-auth-library` — never trusts a client-supplied payload without
 * verification. BLOCKED on the client handing over a real Google OAuth
 * Client ID/Secret (see env.validation.ts) — until then this class exists but
 * is never exercised end-to-end; `AUTH_IDENTITY_DRIVER=fake` is the only path
 * used in dev/test (mirrors MercadoPagoPaymentAdapter's shape before real
 * credentials existed).
 */
@Injectable()
export class GoogleIdentityAdapter implements IdentityPort {
  private readonly logger = new Logger(GoogleIdentityAdapter.name);
  private readonly client: OAuth2Client;
  private readonly clientId: string;

  constructor(config: ConfigService<Env, true>) {
    this.clientId = config.get('GOOGLE_OAUTH_CLIENT_ID', { infer: true }) ?? '';
    this.client = new OAuth2Client(this.clientId);
  }

  async verifyGoogleIdToken(idToken: string): Promise<IdentityClaims> {
    let ticket;
    try {
      ticket = await this.client.verifyIdToken({ idToken, audience: this.clientId });
    } catch (error) {
      this.logger.warn(`Google ID token verification failed: ${(error as Error).message}`);
      throw new Error('Invalid Google ID token');
    }
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.sub) {
      throw new Error('Invalid Google ID token: missing email/sub claim');
    }
    return {
      email: payload.email.trim().toLowerCase(),
      name: payload.name ?? payload.email,
      emailVerified: payload.email_verified ?? false,
      sub: payload.sub,
    };
  }
}

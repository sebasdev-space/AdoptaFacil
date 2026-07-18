import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenClaims, AccountType, AuthTokens } from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { AUTH_CONFIG, type AuthConfig } from './auth.config';

/** Everything needed to mint a token pair for a user. */
export interface TokenPrincipal {
  userId: string;
  organizationId: string;
  accountType: AccountType;
  email: string;
}

/**
 * Issues and rotates tokens:
 *  - access token: a short-lived signed JWT carrying the tenant (`org`) claim,
 *    so the tenant middleware can resolve the organization from the principal.
 *  - refresh token: an opaque random string; only its SHA-256 hash is persisted
 *    (never the token itself), and every use rotates it — the old row is revoked
 *    and linked to its replacement so reuse can be detected.
 *
 * The refresh/credential tables are NOT tenant-scoped, so these queries run on
 * the base client (no org context needed).
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private signAccessToken(principal: TokenPrincipal): string {
    const claims: AccessTokenClaims = {
      sub: principal.userId,
      org: principal.organizationId,
      typ: principal.accountType,
      email: principal.email,
    };
    return this.jwt.sign(claims, { expiresIn: this.config.accessTtlSeconds });
  }

  private async persistRefreshToken(userId: string): Promise<string> {
    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.refreshTtlSeconds * 1000);
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: this.hashToken(refreshToken), expiresAt },
    });
    return refreshToken;
  }

  /** Mint a fresh access + refresh pair for a principal (login / register). */
  async issueTokens(principal: TokenPrincipal): Promise<AuthTokens> {
    const refreshToken = await this.persistRefreshToken(principal.userId);
    return {
      accessToken: this.signAccessToken(principal),
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.config.accessTtlSeconds,
    };
  }

  /** Validate a refresh token and rotate it, returning a new token pair. */
  async rotate(presentedRefreshToken: string): Promise<AuthTokens> {
    const tokenHash = this.hashToken(presentedRefreshToken);
    const existing = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!existing || existing.revokedAt || existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const credential = await this.prisma.authCredential.findUnique({
      where: { userId: existing.userId },
    });
    if (!credential) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const principal: TokenPrincipal = {
      userId: credential.userId,
      organizationId: credential.organizationId,
      accountType: credential.accountType as AccountType,
      email: credential.email,
    };

    const newRefreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.refreshTtlSeconds * 1000);
    const replacement = await this.prisma.refreshToken.create({
      data: { userId: principal.userId, tokenHash: this.hashToken(newRefreshToken), expiresAt },
    });
    // Revoke the presented token and link it to its replacement (reuse trail).
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedById: replacement.id },
    });

    return {
      accessToken: this.signAccessToken(principal),
      refreshToken: newRefreshToken,
      tokenType: 'Bearer',
      expiresIn: this.config.accessTtlSeconds,
    };
  }

  /** Revoke a refresh token (logout). Idempotent and safe for unknown tokens. */
  async revoke(presentedRefreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(presentedRefreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

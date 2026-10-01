import { randomBytes } from 'node:crypto';
import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import type {
  MercadoPagoConnectStatusView,
  MercadoPagoConnectUrlView,
} from '@adoptafacil/contracts';
import type { Env } from '../../config/env.validation';
import { AuditService } from '../../core/audit/audit.service';
import { MercadoPagoOAuthClient } from '../../core/payments/mercadopago-oauth.client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';
import {
  MERCADOPAGO_CONNECT_STATE_TTL_SECONDS,
  type MercadoPagoConnectStateClaims,
} from './mercadopago-connect.constants';
import { isDueForRefresh } from './mercadopago-token-refresh.window';

/** Default token lifetime when MercadoPago's response doesn't include
 *  `expires_in` — verified live against the real sandbox (both access and
 *  refresh tokens last 180 days). */
const DEFAULT_TOKEN_TTL_SECONDS = 180 * 24 * 60 * 60;

/** Row shape returned by `mercadopago_accounts_due_for_refresh()` (raw SQL,
 *  snake_case — see the migration for the SECURITY DEFINER function). */
interface DueForRefreshRow {
  id: string;
  organization_id: string;
  refresh_token: string;
  expires_at: Date;
}

/**
 * Split de Pagos 1:1 (T-OAuth-Connect) — connect/disconnect/status for the
 * organization's OWN MercadoPago account, plus the batch token-refresh the
 * scheduler drives. ONLY the connect infra: wiring the connected `mpUserId`
 * into an actual split payment at checkout is a separate follow-up (out of
 * scope here — see `OrganizationMercadoPagoAccount`'s doc comment in
 * payments.prisma).
 *
 * `state` CSRF handling: `/connect` is authenticated (knows the org from the
 * request's tenant context), but MercadoPago's `/callback` redirect is
 * necessarily PUBLIC (a browser redirect carries no Authorization header).
 * `state` is a short-lived signed JWT — the SAME `JwtService`/secret
 * `TokenService`/`JwtAuthGuard` already use (global `JwtModule`, see
 * `auth.module.ts`) — encoding `{ organizationId, nonce }`. No extra DB table
 * is needed just to track a pending connect attempt: the signed JWT IS the
 * state store. `/callback` never trusts `state` unverified.
 */
@Injectable()
export class MercadoPagoConnectService {
  private readonly logger = new Logger(MercadoPagoConnectService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
    private readonly oauth: MercadoPagoOAuthClient,
  ) {}

  private requireOrgId(): string {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return organizationId;
  }

  /** Build the `state` JWT + the full MercadoPago authorize URL for the
   *  caller's org (`GET /org/mercadopago/connect`, Owner/Administrator). The
   *  FRONTEND does the actual full-page navigation — this only returns the
   *  URL. */
  getConnectUrl(): MercadoPagoConnectUrlView {
    const organizationId = this.requireOrgId();
    const claims: MercadoPagoConnectStateClaims = {
      organizationId,
      nonce: randomBytes(16).toString('hex'),
    };
    const state = this.jwt.sign(claims, { expiresIn: MERCADOPAGO_CONNECT_STATE_TTL_SECONDS });
    return { authorizeUrl: this.oauth.buildAuthorizeUrl(state) };
  }

  /** Verify the `state` JWT round-tripped through MercadoPago's redirect,
   *  recovering the organization it was minted for. Throws
   *  `UnauthorizedException` on anything invalid/expired/tampered — NEVER
   *  trusts `state` unverified. */
  private verifyState(state: string): MercadoPagoConnectStateClaims {
    try {
      return this.jwt.verify<MercadoPagoConnectStateClaims>(state);
    } catch {
      throw new UnauthorizedException('Invalid or expired MercadoPago connect state');
    }
  }

  /**
   * `GET /org/mercadopago/callback` (public): verify `state`, exchange `code`
   * for tokens, upsert the org's row. Returns the organization id on success
   * so the controller can log it; throws on ANY failure (invalid state, token
   * exchange failure) — the controller catches and redirects generically,
   * never leaking WHY in the redirect URL itself (only server-side logs get
   * the real reason).
   */
  async handleCallback(code: string, state: string): Promise<{ organizationId: string }> {
    const { organizationId } = this.verifyState(state);

    let tokens;
    try {
      tokens = await this.oauth.exchangeCode(code, state);
    } catch (error) {
      this.logger.warn(
        `MercadoPago OAuth exchange failed for org ${organizationId}: ${(error as Error).message}`,
      );
      throw error;
    }

    const expiresAt = new Date(
      Date.now() + (tokens.expires_in ?? DEFAULT_TOKEN_TTL_SECONDS) * 1000,
    );
    const mpUserId = String(tokens.user_id ?? '');

    await this.prisma.withOrgContext(organizationId, async (tx) => {
      await tx.organizationMercadoPagoAccount.upsert({
        where: { organizationId },
        create: {
          organizationId,
          mpUserId,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? '',
          expiresAt,
        },
        update: {
          mpUserId,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? '',
          expiresAt,
        },
      });
      // NEVER the tokens in audit metadata — only the event + mpUserId (the
      // sponsor/collector id is not a secret, it identifies the account).
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId: null,
        action: 'mercadopago_account.connected',
        entityType: 'organization_mercadopago_account',
        entityId: organizationId,
        metadata: { mpUserId },
      });
    });

    return { organizationId };
  }

  /** `GET /org/mercadopago/status` (Owner/Administrator) — never the tokens. */
  async getStatus(): Promise<MercadoPagoConnectStatusView> {
    const organizationId = this.requireOrgId();
    const row = await this.prisma.withOrgContext(organizationId, (tx) =>
      tx.organizationMercadoPagoAccount.findUnique({ where: { organizationId } }),
    );
    if (!row) {
      return { connected: false };
    }
    return {
      connected: true,
      connectedAt: row.connectedAt.toISOString(),
      mpUserId: row.mpUserId,
    };
  }

  /** `DELETE /org/mercadopago/connect` (Owner/Administrator) — disconnects
   *  the caller org's account. Idempotent: disconnecting an already-absent
   *  row is a no-op, not an error. */
  async disconnect(actorUserId: string): Promise<void> {
    const organizationId = this.requireOrgId();
    await this.prisma.withOrgContext(organizationId, async (tx) => {
      const deleted = await tx.organizationMercadoPagoAccount.deleteMany({
        where: { organizationId },
      });
      if (deleted.count === 0) {
        return;
      }
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'mercadopago_account.disconnected',
        entityType: 'organization_mercadopago_account',
        entityId: organizationId,
        metadata: {},
      });
    });
  }

  /**
   * Daily token-refresh scan (scheduler-driven, no tenant context — a
   * background worker, same shape as `SponsorshipBillingService.runDailyScan`).
   * Cross-tenant DISCOVERY via the `mercadopago_accounts_due_for_refresh`
   * SECURITY DEFINER function, then one `withOrgContext(organizationId, ...)`
   * write per row. A refresh failure for ONE org is logged and the batch
   * continues — never let one org's failure stop the others.
   */
  async refreshDueAccounts(): Promise<void> {
    const windowDays = this.config.get('MERCADOPAGO_TOKEN_REFRESH_WINDOW_DAYS', { infer: true });
    const rows = await this.prisma.$queryRaw<DueForRefreshRow[]>(
      Prisma.sql`SELECT * FROM mercadopago_accounts_due_for_refresh(${windowDays})`,
    );

    let refreshed = 0;
    let failed = 0;
    for (const row of rows) {
      // Defensive re-check with the pure window function (belt & suspenders —
      // the SQL function already filters, this just keeps the eligibility
      // rule in ONE testable place per T-OAuth-Connect's convention).
      if (!isDueForRefresh(row.expires_at, new Date(), windowDays)) {
        continue;
      }
      try {
        await this.refreshOneAccount(row);
        refreshed += 1;
      } catch (error) {
        failed += 1;
        this.logger.warn(
          `MercadoPago token refresh failed for org ${row.organization_id}: ${(error as Error).message}`,
        );
      }
    }
    this.logger.log(`mercadopago-token-refresh scan: ${refreshed} refreshed, ${failed} failed`);
  }

  private async refreshOneAccount(row: DueForRefreshRow): Promise<void> {
    const tokens = await this.oauth.refreshToken(row.refresh_token);
    const expiresAt = new Date(
      Date.now() + (tokens.expires_in ?? DEFAULT_TOKEN_TTL_SECONDS) * 1000,
    );
    await this.prisma.withOrgContext(row.organization_id, async (tx) => {
      await tx.organizationMercadoPagoAccount.update({
        where: { organizationId: row.organization_id },
        data: {
          accessToken: tokens.access_token,
          // A refresh_token grant may or may not return a NEW refresh token —
          // keep the existing one when MercadoPago omits it.
          refreshToken: tokens.refresh_token ?? row.refresh_token,
          expiresAt,
        },
      });
      await this.audit.recordWithTx(tx, {
        organizationId: row.organization_id,
        actorUserId: null,
        action: 'mercadopago_account.refreshed',
        entityType: 'organization_mercadopago_account',
        entityId: row.organization_id,
        metadata: {},
      });
    });
  }
}

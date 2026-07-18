import { Injectable, Logger, Optional, type NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, Response } from 'express';
import type { AccessTokenClaims } from '@adoptafacil/contracts';
import { TenantContextService } from './tenant-context.service';

/**
 * Fallback header carrying the active organization. Since T-011 the source of
 * truth is the AUTHENTICATED PRINCIPAL (the `org` claim of the access token);
 * this header is only a documented fallback for tooling / pre-auth contexts.
 */
export const ORG_ID_HEADER = 'x-org-id';

/** RFC 4122 UUID (any version). Reject anything else so a bad value never
 *  reaches the database as an org id. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Establishes the per-request tenant context. It resolves the organization from
 * the access token first (the authenticated principal), then falls back to the
 * `x-org-id` header. When an org is resolved, the rest of the request runs
 * inside `TenantContextService.run({ organizationId })` so `withTenant` and RLS
 * see the right tenant. With no org, the request proceeds WITHOUT a context —
 * business queries then hit RLS with no `app.current_org_id` and see zero rows,
 * and `withTenant` rejects. The context is bound to the request's async chain,
 * so it is discarded when the request ends (no leakage between requests).
 *
 * `JwtService` is optional so the middleware still works when the auth module is
 * absent (e.g. isolated tests), degrading to the header fallback.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantContextMiddleware.name);

  constructor(
    private readonly tenant: TenantContextService,
    @Optional() private readonly jwt?: JwtService,
  ) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const organizationId = this.orgFromToken(req) ?? this.orgFromHeader(req);
    if (organizationId) {
      this.tenant.run({ organizationId }, () => next());
      return;
    }
    next();
  }

  /** Organization from the access token's `org` claim (the source of truth). */
  private orgFromToken(req: Request): string | undefined {
    if (!this.jwt) {
      return undefined;
    }
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return undefined;
    }
    try {
      const claims = this.jwt.verify<AccessTokenClaims>(header.slice('Bearer '.length));
      return typeof claims.org === 'string' && UUID_RE.test(claims.org) ? claims.org : undefined;
    } catch {
      // Invalid/expired token: leave tenant resolution to the fallback. The
      // JwtAuthGuard is what actually rejects protected routes.
      return undefined;
    }
  }

  /** Fallback organization from the `x-org-id` header. */
  private orgFromHeader(req: Request): string | undefined {
    const raw = req.headers[ORG_ID_HEADER];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value && UUID_RE.test(value)) {
      return value;
    }
    if (value) {
      this.logger.warn(`Ignoring malformed ${ORG_ID_HEADER} header; request has no tenant context`);
    }
    return undefined;
  }
}

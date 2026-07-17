import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { TenantContextService } from './tenant-context.service';

/**
 * Request header carrying the active organization. In Ola 0 there is no auth
 * layer yet, so the tenant is taken from this header; later waves resolve it
 * from the authenticated principal instead. Either way the resolved value flows
 * through the same {@link TenantContextService} store and the same RLS barrier.
 */
export const ORG_ID_HEADER = 'x-org-id';

/** RFC 4122 UUID (any version). Reject anything else so a bad header never
 *  reaches the database as an org id. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Establishes the per-request tenant context. When the request carries a valid
 * organization id, the rest of the request runs inside
 * `TenantContextService.run({ organizationId })`, so `PrismaService.withTenant`
 * and RLS see the right tenant. When it does not, the request proceeds WITHOUT a
 * context — business queries then hit RLS with no `app.current_org_id` and see
 * zero rows, and `withTenant` rejects. The context is bound to the async chain,
 * so it is automatically discarded when the request ends (no leakage between
 * requests).
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantContextMiddleware.name);

  constructor(private readonly tenant: TenantContextService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const raw = req.headers[ORG_ID_HEADER];
    const value = Array.isArray(raw) ? raw[0] : raw;

    if (value && UUID_RE.test(value)) {
      this.tenant.run({ organizationId: value }, () => next());
      return;
    }

    if (value) {
      this.logger.warn(`Ignoring malformed ${ORG_ID_HEADER} header; request has no tenant context`);
    }
    next();
  }
}

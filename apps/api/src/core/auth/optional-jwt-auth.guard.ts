import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenClaims } from '@adoptafacil/contracts';
import type { AuthenticatedRequest } from './auth.types';

/**
 * Like {@link JwtAuthGuard} but never gates access: it ALWAYS returns `true`.
 * A valid `Authorization: Bearer <token>` still populates `request.user` (so a
 * logged-in donor's donation links to their account, same as today); a
 * missing, malformed, or invalid/expired token just leaves `request.user`
 * unset instead of throwing.
 *
 * Purpose-built for the guest-checkout requirement (donating must never
 * require an account/login): `POST /donations` uses this in place of
 * `JwtAuthGuard` so a guest can still donate while an authenticated donor
 * keeps getting linked. There is no `@Public()` decorator in this codebase —
 * the existing pattern for a real-but-unauthenticated route is simply "no
 * guard" (e.g. `POST /donations/webhook`) — but THIS route needs the "maybe
 * authenticated" middle ground that no existing guard covers, hence this one.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return true;
    }
    try {
      const claims = this.jwt.verify<AccessTokenClaims>(header.slice('Bearer '.length));
      request.user = {
        id: claims.sub,
        organizationId: claims.org,
        accountType: claims.typ,
        email: claims.email,
      };
    } catch {
      // Invalid/expired token on a route that never requires one: proceed as
      // a guest rather than rejecting the request.
    }
    return true;
  }
}

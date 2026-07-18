import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenClaims } from '@adoptafacil/contracts';
import type { AuthenticatedRequest } from './auth.types';

/**
 * Validates the `Authorization: Bearer <access token>` header and attaches the
 * authenticated principal to the request. The tenant context itself is set
 * earlier by the tenant middleware (also from the token), so this guard only
 * gates access to protected routes.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    try {
      const claims = this.jwt.verify<AccessTokenClaims>(header.slice('Bearer '.length));
      request.user = {
        id: claims.sub,
        organizationId: claims.org,
        accountType: claims.typ,
        email: claims.email,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}

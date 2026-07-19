import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@adoptafacil/contracts';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { PrismaService } from '../../prisma/prisma.service';
import { ROLES_KEY } from './roles.decorator';

/**
 * Enforces the roles declared by {@link Roles}. It DENIES BY DEFAULT: any
 * uncertainty — no principal, no tenant context, or no matching role — results
 * in a 403, never an open pass.
 *
 * Authority is read from the tenant-scoped `user_roles` table THROUGH the
 * request's organization context (set by the tenant middleware from the access
 * token). This binds RBAC to the tenant: a user's roles are only ever those
 * granted within their own organization, so an Administrator of Org A holds no
 * authority under Org B.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // No roles declared → this guard imposes no restriction.
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Missing authenticated principal');
    }

    const rows = await this.prisma.withTenant((tx) =>
      tx.userRole.findMany({ where: { userId: user.id } }),
    );
    const held = new Set<string>(rows.map((row) => row.role));
    const permitted = required.some((role) => held.has(role));
    if (!permitted) {
      throw new ForbiddenException('Insufficient role for this operation');
    }
    return true;
  }
}

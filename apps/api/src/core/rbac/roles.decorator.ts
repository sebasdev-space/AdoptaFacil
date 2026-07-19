import { SetMetadata } from '@nestjs/common';
import type { Role } from '@adoptafacil/contracts';

/** Metadata key holding the roles required by a route/controller. */
export const ROLES_KEY = 'rbac:required-roles';

/**
 * Declare the roles allowed to access a handler or controller. Combined with
 * {@link RolesGuard}: access is granted when the caller holds ANY of the listed
 * roles in their organization. Absence of the decorator means no RBAC check
 * (authentication may still be required via the JWT guard).
 *
 * @example
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Roles(Role.Owner, Role.Administrator)
 *   updateSomething() { ... }
 */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

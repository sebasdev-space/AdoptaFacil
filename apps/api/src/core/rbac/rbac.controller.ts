import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { type AssignRoleDto, Role, type RoleAssignment } from '@adoptafacil/contracts';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { RequestUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../auth/zod-validation.pipe';
import { assignRoleSchema } from './rbac.schemas';
import { RbacService } from './rbac.service';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

/**
 * RBAC management endpoints. All require authentication; the mutating and
 * listing routes additionally require an organization role. Role checks run
 * together with the tenant context, so authority never crosses organizations.
 */
@UseGuards(JwtAuthGuard)
@Controller('rbac')
export class RbacController {
  constructor(private readonly rbac: RbacService) {}

  /** The caller's own roles — available to any authenticated user. */
  @Get('my-roles')
  myRoles(@CurrentUser() user: RequestUser): Promise<Role[]> {
    return this.rbac.rolesForUser(user.id);
  }

  /** List all role assignments in the caller's organization. */
  @Get('roles')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Administrator, Role.ReadOnlyAuditor)
  listRoles(): Promise<RoleAssignment[]> {
    return this.rbac.listRolesForOrg();
  }

  /** Assign an organization role to a user of the caller's organization. */
  @Post('roles')
  @UseGuards(RolesGuard)
  @Roles(Role.Owner, Role.Administrator)
  assign(
    @Body(new ZodValidationPipe(assignRoleSchema)) dto: AssignRoleDto,
  ): Promise<RoleAssignment> {
    return this.rbac.assignRole(dto.userId, dto.role);
  }

  /** Revoke a role from a user of the caller's organization. */
  @Delete('roles/:userId/:role')
  @HttpCode(204)
  @UseGuards(RolesGuard)
  @Roles(Role.Owner)
  async revoke(@Param('userId') userId: string, @Param('role') role: Role): Promise<void> {
    await this.rbac.revokeRole(userId, role);
  }
}

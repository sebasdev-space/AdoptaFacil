import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { UserRole as UserRoleRow } from '@prisma/client';
import type { Role, RoleAssignment } from '@adoptafacil/contracts';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';

function toRoleAssignment(row: UserRoleRow): RoleAssignment {
  return {
    userId: row.userId,
    role: row.role as Role,
    organizationId: row.organizationId,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Reads and writes role assignments, always through the request's tenant
 * context — every query/write is RLS-scoped to the caller's organization, so an
 * admin can only manage authority within their own org.
 */
@Injectable()
export class RbacService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  /** Roles held by a user in the caller's organization. */
  async rolesForUser(userId: string): Promise<Role[]> {
    const rows = await this.prisma.withTenant((tx) => tx.userRole.findMany({ where: { userId } }));
    return rows.map((row) => row.role as Role);
  }

  /** All role assignments in the caller's organization. */
  async listRolesForOrg(): Promise<RoleAssignment[]> {
    const rows = await this.prisma.withTenant((tx) => tx.userRole.findMany());
    return rows.map(toRoleAssignment);
  }

  /** Grant a role to a user of the caller's organization (idempotent). Records
   *  an append-only audit event in the SAME transaction as the assignment. */
  async assignRole(actorUserId: string, userId: string, role: Role): Promise<RoleAssignment> {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return this.prisma.withTenant(async (tx) => {
      // RLS makes only same-org users visible: assigning to a user outside the
      // caller's organization yields "not found", never cross-tenant authority.
      const target = await tx.user.findUnique({ where: { id: userId } });
      if (!target) {
        throw new NotFoundException('User not found in this organization');
      }
      const row = await tx.userRole.upsert({
        where: { organizationId_userId_role: { organizationId, userId, role } },
        create: { organizationId, userId, role },
        update: {},
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'role.assigned',
        entityType: 'user',
        entityId: userId,
        metadata: { role },
      });
      return toRoleAssignment(row);
    });
  }

  /** Revoke a role from a user of the caller's organization (idempotent). */
  async revokeRole(userId: string, role: Role): Promise<void> {
    await this.prisma.withTenant((tx) => tx.userRole.deleteMany({ where: { userId, role } }));
  }
}

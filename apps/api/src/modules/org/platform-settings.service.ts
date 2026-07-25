import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  type PlatformSettings,
  type ShowOrganizationTypePolicy,
  type UpdatePlatformSettingsInput,
} from '@adoptafacil/contracts';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../core/tenant/tenant-context.service';

const SINGLETON_ID = 'global';
const DEFAULT_POLICY: ShowOrganizationTypePolicy = 'formalized_only';

/**
 * Platform-wide settings (T-030). A SINGLE global config (not tenant data), so
 * `platform_settings` is not under RLS; access is gated to platform roles at the
 * controller. Reads need no tenant context; a change is audited under the acting
 * platform admin's org (UTC).
 */
@Injectable()
export class PlatformSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  /** Current platform settings (falls back to the default policy if unseeded). */
  async get(): Promise<PlatformSettings> {
    const row = await this.prisma.platformSettings.findUnique({ where: { id: SINGLETON_ID } });
    return {
      showOrganizationType:
        (row?.showOrganizationType as ShowOrganizationTypePolicy) ?? DEFAULT_POLICY,
    };
  }

  /** Update the settings (PlatformAdmin/PlatformSuperAdmin only, enforced at the
   *  controller). Records an append-only audit event in the same transaction. */
  async update(actorUserId: string, input: UpdatePlatformSettingsInput): Promise<PlatformSettings> {
    const organizationId = this.tenant.getOrganizationId();
    if (!organizationId) {
      throw new ForbiddenException('Missing tenant context');
    }
    return this.prisma.withOrgContext(organizationId, async (tx) => {
      const row = await tx.platformSettings.upsert({
        where: { id: SINGLETON_ID },
        create: {
          id: SINGLETON_ID,
          showOrganizationType: input.showOrganizationType,
          updatedByUserId: actorUserId,
        },
        update: { showOrganizationType: input.showOrganizationType, updatedByUserId: actorUserId },
      });
      await this.audit.recordWithTx(tx, {
        organizationId,
        actorUserId,
        action: 'platform.settings_updated',
        entityType: 'platform_settings',
        entityId: SINGLETON_ID,
        metadata: { showOrganizationType: input.showOrganizationType },
      });
      return { showOrganizationType: row.showOrganizationType as ShowOrganizationTypePolicy };
    });
  }
}

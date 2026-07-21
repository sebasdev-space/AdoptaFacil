import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { FormalizationController } from './formalization.controller';
import { FormalizationService } from './formalization.service';
import { OrgController } from './org.controller';
import { OrgProfileService } from './org-profile.service';
import { LocalStubStorageAdapter } from './storage/local-stub-storage.adapter';
import { STORAGE_PORT } from './storage/storage.port';

/**
 * M01 · Organization profile (CRUD) + public portal read + formalization state
 * machine (RF02). Consumes core (tenant/auth/rbac/audit) — RolesGuard /
 * AuditService / TenantContextService are global; AuthModule is imported for the
 * JwtAuthGuard used by these controllers. The StoragePort is bound to the
 * simulable stub adapter for Ola 1.
 */
@Module({
  imports: [AuthModule],
  controllers: [OrgController, FormalizationController],
  providers: [
    OrgProfileService,
    FormalizationService,
    { provide: STORAGE_PORT, useClass: LocalStubStorageAdapter },
  ],
})
export class OrgModule {}

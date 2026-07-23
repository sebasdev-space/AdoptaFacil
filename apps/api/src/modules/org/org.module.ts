import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { FormalizationController } from './formalization.controller';
import { FormalizationService } from './formalization.service';
import { OrgController } from './org.controller';
import { OrgProfileService } from './org-profile.service';
import { PlatformDocumentsController } from './platform-documents.controller';
import { PlatformDocumentsService } from './platform-documents.service';
import { LocalStubStorageAdapter } from './storage/local-stub-storage.adapter';
import { STORAGE_PORT } from './storage/storage.port';

/**
 * M01 · Organization profile (CRUD) + public portal read + formalization state
 * machine (RF02) + documentary management with versioning/expiry and cross-tenant
 * platform review (RF03, T-103). Consumes core (tenant/auth/rbac/audit) — global
 * providers; AuthModule is imported for the JwtAuthGuard. The StoragePort is
 * bound to the simulable stub adapter for Ola 1.
 */
@Module({
  imports: [AuthModule],
  controllers: [
    OrgController,
    FormalizationController,
    DocumentsController,
    PlatformDocumentsController,
  ],
  providers: [
    OrgProfileService,
    FormalizationService,
    DocumentsService,
    PlatformDocumentsService,
    { provide: STORAGE_PORT, useClass: LocalStubStorageAdapter },
  ],
})
export class OrgModule {}

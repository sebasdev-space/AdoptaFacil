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

/**
 * M01 · Organization profile (CRUD) + public portal read + formalization state
 * machine (RF02) + documentary management with versioning/expiry and cross-tenant
 * platform review (RF03, T-103). Consumes core (tenant/auth/rbac/audit) — global
 * providers; AuthModule is imported for the JwtAuthGuard. STORAGE_PORT is
 * provided by the shared, global StorageModule (core, T-107) — no local binding.
 */
@Module({
  imports: [AuthModule],
  controllers: [
    OrgController,
    FormalizationController,
    DocumentsController,
    PlatformDocumentsController,
  ],
  providers: [OrgProfileService, FormalizationService, DocumentsService, PlatformDocumentsService],
})
export class OrgModule {}

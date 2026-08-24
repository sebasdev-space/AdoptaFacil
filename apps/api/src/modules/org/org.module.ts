import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { DIAN_VERIFICATION_QUEUE } from './dian-verification.constants';
import { DianVerificationProcessor } from './dian-verification.processor';
import { DianVerificationService } from './dian-verification.service';
import { DIAN_PORT } from './dian.port';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { FakeDianAdapter } from './fake-dian.adapter';
import { FormalizationController } from './formalization.controller';
import { FormalizationService } from './formalization.service';
import {
  LEGAL_REPRESENTATIVE_CONFIG,
  loadLegalRepresentativeConfig,
} from './legal-representative-crypto';
import { LegalRepresentativeController } from './legal-representative.controller';
import { LegalRepresentativeService } from './legal-representative.service';
import { OrgController } from './org.controller';
import { OrgProfileService } from './org-profile.service';
import { OrganizationSummaryController } from './organization-summary.controller';
import { OrganizationSummaryService } from './organization-summary.service';
import { PlatformDocumentsController } from './platform-documents.controller';
import { PlatformDocumentsService } from './platform-documents.service';
import { PlatformDuplicatesController } from './platform-duplicates.controller';
import { PlatformDuplicatesService } from './platform-duplicates.service';
import { PlatformSettingsController } from './platform-settings.controller';
import { PlatformSettingsService } from './platform-settings.service';

/**
 * M01 · Organization profile (CRUD) + public portal read + formalization state
 * machine (RF02) + documentary management (RF03, T-103) + organization type badge
 * & platform policy (RF01, T-030). Consumes core (tenant/auth/rbac/audit) —
 * global providers; AuthModule is imported for the JwtAuthGuard. STORAGE_PORT is
 * provided by the shared, global StorageModule (core, T-107) — no local binding.
 */
@Module({
  // BullModule.registerQueue only registers a QUEUE NAME on the already-global
  // BullMQ↔Redis connection (QueueModule, core) — it does not touch or
  // reconfigure that shared module, same pattern AnimalsModule already uses
  // for REMINDERS_QUEUE.
  imports: [AuthModule, BullModule.registerQueue({ name: DIAN_VERIFICATION_QUEUE })],
  controllers: [
    OrgController,
    FormalizationController,
    DocumentsController,
    LegalRepresentativeController,
    OrganizationSummaryController,
    PlatformDocumentsController,
    PlatformDuplicatesController,
    PlatformSettingsController,
  ],
  providers: [
    OrgProfileService,
    FormalizationService,
    DocumentsService,
    DuplicateDetectionService,
    PlatformDuplicatesService,
    LegalRepresentativeService,
    { provide: LEGAL_REPRESENTATIVE_CONFIG, useFactory: loadLegalRepresentativeConfig },
    OrganizationSummaryService,
    PlatformDocumentsService,
    PlatformSettingsService,
    DianVerificationService,
    DianVerificationProcessor,
    {
      provide: DIAN_PORT,
      useFactory: () => {
        // DIAN has NO official API (documento base) — 'fake' is the only real
        // option today; DIAN_DRIVER exists only so a future real adapter can
        // slot in later without touching any consumer (TODO(client), see
        // dian.port.ts).
        const driver = process.env.DIAN_DRIVER ?? 'fake';
        if (driver !== 'fake') {
          throw new Error(`Unsupported DIAN_DRIVER "${driver}" — only "fake" exists today.`);
        }
        const latencyMs = process.env.DIAN_FAKE_LATENCY_MS
          ? Number(process.env.DIAN_FAKE_LATENCY_MS)
          : undefined;
        const failuresBeforeSuccess = process.env.DIAN_FAKE_FAILURES
          ? Number(process.env.DIAN_FAKE_FAILURES)
          : undefined;
        return new FakeDianAdapter({ latencyMs, failuresBeforeSuccess });
      },
    },
  ],
  // M13 (S-8): the platform dashboard consolidates the documents/duplicates
  // queue COUNTS by injecting these two services directly and reusing their
  // existing `.queue()` method — never a parallel count. Exported ONLY these
  // two (not the whole module's surface) to keep the cross-module dependency
  // minimal and explicit.
  exports: [PlatformDocumentsService, PlatformDuplicatesService],
})
export class OrgModule {}

import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { AdoptionsController } from './adoptions.controller';
import { AdoptionsService } from './adoptions.service';
import { AdoptionContractsController } from './adoption-contracts.controller';
import { AdoptionContractsService } from './adoption-contracts.service';
import { SIGNATURE_PORT } from './signature/signature.port';
import { FakeSignatureAdapter } from './signature/fake-signature.adapter';
import { FollowUpController } from './followup.controller';
import { FollowUpService } from './followup.service';
import { FollowUpScheduler } from './followup.scheduler';
import { FollowUpProcessor } from './followup.processor';
import { FOLLOWUP_QUEUE } from './followup.constants';

/**
 * M04 · Adoptions — request + evaluation kanban (T-028a), the CONTRACT +
 * electronic signature (T-028b), and post-adoption FOLLOW-UP (T-028c: milestones,
 * questionnaires, evidence, overdue alerts). Consumes core (tenant/rbac/audit/
 * notifications/storage are global) and imports AuthModule for the JwtAuthGuard.
 * Owns the `adoption_requests`/`adoption_contracts`/`adoption_followup_*` tables
 * (RLS) and their SECURITY DEFINER cross-tenant writes. The SignaturePort is bound
 * HERE (local, not core/) to the simulable fake adapter. The follow-up overdue
 * scan runs on the reusable global BullMQ↔Redis connection (QueueModule); the
 * StoragePort/NotificationPort come from the shared global core modules.
 */
@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: FOLLOWUP_QUEUE })],
  controllers: [AdoptionsController, AdoptionContractsController, FollowUpController],
  providers: [
    AdoptionsService,
    AdoptionContractsService,
    { provide: SIGNATURE_PORT, useClass: FakeSignatureAdapter },
    FollowUpService,
    FollowUpScheduler,
    FollowUpProcessor,
  ],
})
export class AdoptionsModule {}

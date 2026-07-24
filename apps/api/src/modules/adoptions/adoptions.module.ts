import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { AdoptionsController } from './adoptions.controller';
import { AdoptionsService } from './adoptions.service';
import { AdoptionContractsController } from './adoption-contracts.controller';
import { AdoptionContractsService } from './adoption-contracts.service';
import { SIGNATURE_PORT } from './signature/signature.port';
import { FakeSignatureAdapter } from './signature/fake-signature.adapter';

/**
 * M04 · Adoptions — adoption request + evaluation kanban (T-028a) and the
 * adoption CONTRACT + electronic signature (T-028b). Consumes core (tenant/rbac/
 * audit/notifications are global) and imports AuthModule for the JwtAuthGuard.
 * Owns the `adoption_requests` and `adoption_contracts` tables (RLS) and their
 * SECURITY DEFINER cross-tenant writes. The SignaturePort is bound HERE (local to
 * the module, not core/) to the simulable fake adapter in Ola 1 — swap in one
 * place for a real electronic-signature provider (Ley 527/1999) later.
 */
@Module({
  imports: [AuthModule],
  controllers: [AdoptionsController, AdoptionContractsController],
  providers: [
    AdoptionsService,
    AdoptionContractsService,
    { provide: SIGNATURE_PORT, useClass: FakeSignatureAdapter },
  ],
})
export class AdoptionsModule {}

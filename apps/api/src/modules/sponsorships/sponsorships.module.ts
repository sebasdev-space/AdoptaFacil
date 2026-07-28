import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { PublicSponsorshipsController } from './public-sponsorships.controller';
import { PublicSponsorshipsService } from './public-sponsorships.service';
import { SponsorshipPlansController } from './sponsorship-plans.controller';
import { SponsorshipPlansService } from './sponsorship-plans.service';
import { SponsorshipsController } from './sponsorships.controller';
import { SponsorshipsService } from './sponsorships.service';

/**
 * M07 · Recurring sponsorships base (RF17 · T-056): plans (tenant-scoped CRUD,
 * Owner/Administrator) + subscriptions (any authenticated Person, cross-tenant
 * via a bounded SECURITY DEFINER function) + lifecycle (suspend/reactivate/
 * cancel, Owner/Administrator) + immutable history, plus an optional public
 * portal summary via bounded SECURITY DEFINER exposure. Consumes core
 * (tenant/auth/rbac/audit) — global providers; AuthModule is imported for the
 * JwtAuthGuard. NO payment is processed (TODO T-057 connects PAYMENT_PORT).
 */
@Module({
  imports: [AuthModule],
  controllers: [SponsorshipPlansController, SponsorshipsController, PublicSponsorshipsController],
  providers: [SponsorshipPlansService, SponsorshipsService, PublicSponsorshipsService],
})
export class SponsorshipsModule {}

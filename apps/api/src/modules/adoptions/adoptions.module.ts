import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { AdoptionsController } from './adoptions.controller';
import { AdoptionsService } from './adoptions.service';

/**
 * M04 · Adoptions (T-028a) — adoption request + evaluation kanban. Consumes core
 * (tenant/rbac/audit/notifications are global); imports AuthModule for the
 * JwtAuthGuard used by the controller. Owns only the `adoption_requests` table
 * (RLS) and the `create_adoption_request` SECURITY DEFINER write. The animal is
 * referenced by contract (`AnimalSummary`), never by touching M03 tables.
 */
@Module({
  imports: [AuthModule],
  controllers: [AdoptionsController],
  providers: [AdoptionsService],
})
export class AdoptionsModule {}

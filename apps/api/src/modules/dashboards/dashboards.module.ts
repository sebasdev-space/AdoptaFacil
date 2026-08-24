import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { OrgModule } from '../org/org.module';
import { ReputationModule } from '../reputation/reputation.module';
import { PlatformDashboardController } from './platform-dashboard.controller';
import { PlatformAdminDashboardService } from './platform-admin-dashboard.service';
import { PlatformSuperAdminDashboardService } from './platform-super-admin-dashboard.service';

/**
 * M13 · dashboards por audiencia — PlatformAdmin/PlatformSuperAdmin (RF24,
 * S-8). Imports OrgModule/ReputationModule ONLY to reuse their exported
 * queue services (no duplicated counting logic); this does not re-register
 * their controllers (Nest module imports only share exported providers).
 */
@Module({
  imports: [AuthModule, OrgModule, ReputationModule],
  controllers: [PlatformDashboardController],
  providers: [PlatformAdminDashboardService, PlatformSuperAdminDashboardService],
})
export class DashboardsModule {}

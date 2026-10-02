import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { OrgModule } from '../org/org.module';
import { ReputationModule } from '../reputation/reputation.module';
import { PlatformDashboardController } from './platform-dashboard.controller';
import { PlatformAdminDashboardService } from './platform-admin-dashboard.service';
import { PlatformSuperAdminDashboardService } from './platform-super-admin-dashboard.service';
import { OrgDonationsDashboardController } from './org-donations-dashboard.controller';
import { OrgDonationsDashboardService } from './org-donations-dashboard.service';

/**
 * M13 · dashboards por audiencia — PlatformAdmin/PlatformSuperAdmin (RF24,
 * S-8) y, desde S-14, el dashboard de donaciones/campañas de la organización.
 * Imports OrgModule/ReputationModule ONLY to reuse their exported queue
 * services (no duplicated counting logic); this does not re-register their
 * controllers (Nest module imports only share exported providers).
 * `RbacService` (consumed by `OrgDonationsDashboardService`) llega vía
 * `RbacModule`, que es `@Global()` — no hace falta importarlo aquí.
 */
@Module({
  imports: [AuthModule, OrgModule, ReputationModule],
  controllers: [PlatformDashboardController, OrgDonationsDashboardController],
  providers: [
    PlatformAdminDashboardService,
    PlatformSuperAdminDashboardService,
    OrgDonationsDashboardService,
  ],
})
export class DashboardsModule {}

import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  type PlatformAdminDashboardSummary,
  type PlatformSuperAdminDashboardSummary,
  Role,
} from '@adoptafacil/contracts';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { PlatformAdminDashboardService } from './platform-admin-dashboard.service';
import { PlatformSuperAdminDashboardService } from './platform-super-admin-dashboard.service';

/**
 * M13 dashboards (RF24, S-8). Two DIFFERENT role gates on purpose — no
 * class-level `@Roles`, each endpoint declares its own (same convention as
 * `VolunteerEnrollmentsController`'s VIEW_ROLES vs MANAGE_ROLES): the Admin
 * dashboard is visible to PlatformAdmin AND PlatformSuperAdmin, but the
 * SuperAdmin financial dashboard is visible to PlatformSuperAdmin ONLY — a
 * regular PlatformAdmin must never see aggregated financial figures.
 */
@Controller('platform/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlatformDashboardController {
  constructor(
    private readonly adminDashboard: PlatformAdminDashboardService,
    private readonly superAdminDashboard: PlatformSuperAdminDashboardService,
  ) {}

  @Get('admin')
  @Roles(Role.PlatformAdmin, Role.PlatformSuperAdmin)
  getAdminSummary(): Promise<PlatformAdminDashboardSummary> {
    return this.adminDashboard.getSummary();
  }

  @Get('super-admin')
  @Roles(Role.PlatformSuperAdmin)
  getSuperAdminSummary(): Promise<PlatformSuperAdminDashboardSummary> {
    return this.superAdminDashboard.getSummary();
  }
}

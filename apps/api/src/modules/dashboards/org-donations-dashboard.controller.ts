import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role, type OrgDonationsDashboardSummary } from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { OrgDonationsDashboardService } from './org-donations-dashboard.service';

/**
 * Dashboard de donaciones/campañas de la organización (M13, S-14). El
 * `@Roles` del controlador es la UNIÓN de los tres roles-por-sección del
 * servicio (deny-by-default para Volunteer/TemporaryCollaborator/Veterinarian,
 * que no ven ningún dashboard hoy) — qué secciones concretas trae la
 * respuesta ya lo decide `OrgDonationsDashboardService` según el rol real del
 * actor, nunca aquí.
 */
@Controller('org/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrgDonationsDashboardController {
  constructor(private readonly service: OrgDonationsDashboardService) {}

  @Get('donations')
  @Roles(Role.Owner, Role.Administrator, Role.Operator, Role.ReadOnlyAuditor)
  getSummary(@CurrentUser() actor: RequestUser): Promise<OrgDonationsDashboardSummary> {
    return this.service.getSummary(actor);
  }
}

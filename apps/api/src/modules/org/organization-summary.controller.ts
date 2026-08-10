import { Controller, Get, UseGuards } from '@nestjs/common';
import { type OrganizationDashboardSummary, Role } from '@adoptafacil/contracts';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { OrganizationSummaryService } from './organization-summary.service';

/** Roles that may view the org summary (S2-08 acceptance criteria) — the same
 *  set that manages the underlying resources it aggregates. Deny-by-default:
 *  no ReadOnlyAuditor here, since the spec's acceptance criteria don't list it
 *  (additive to widen later, if asked). */
const VIEW_ROLES = [Role.Owner, Role.Administrator, Role.Operator] as const;

/**
 * M13 dashboards — minimal organization summary (S2-08), adelantado de Ola 3
 * con alcance mínimo para el pitch del 13-ago. Un único endpoint de solo
 * lectura que agrega conteos/totales YA calculados en otros módulos, para que
 * Fabián no tenga que hacer 6 llamadas separadas desde la Fase C3 del
 * rediseño visual.
 */
@Controller('org/summary')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganizationSummaryController {
  constructor(private readonly service: OrganizationSummaryService) {}

  @Get()
  @Roles(...VIEW_ROLES)
  getSummary(): Promise<OrganizationDashboardSummary> {
    return this.service.getSummary();
  }
}

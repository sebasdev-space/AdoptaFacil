import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role, type ReconciliationReport } from '@adoptafacil/contracts';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { ReconciliationService } from './reconciliation.service';
import { reconciliationQuerySchema, type ReconciliationQuery } from './reconciliation.schemas';

/** Conciliación es un reporte de tesorería — mismo set que dispara/inspecciona
 *  payouts (PlatformAdmin/PlatformSuperAdmin), nunca un rol de organización. */
const PLATFORM_ROLES = [Role.PlatformAdmin, Role.PlatformSuperAdmin] as const;

/**
 * M15b (F-5, RF26) — conciliación básica de recaudo vs. dispersión. SOLO
 * LECTURA: primer dato real que el dashboard financiero de Super
 * Administración (M13/RF28, @sebastian) consumirá. Ver el DTO
 * `ReconciliationReport`/`ReconciliationPeriodRow` en `@adoptafacil/contracts`
 * para la forma exacta — coordínala con él antes de construir su vista.
 */
@Controller('platform/reconciliation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...PLATFORM_ROLES)
export class ReconciliationController {
  constructor(private readonly service: ReconciliationService) {}

  @Get()
  getReport(
    @Query(new ZodValidationPipe(reconciliationQuerySchema)) query: ReconciliationQuery,
  ): Promise<ReconciliationReport> {
    return this.service.getReport(query.from, query.to, query.organizationId);
  }
}

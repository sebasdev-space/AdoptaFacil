import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  type DecideServiceHoursInput,
  type LogServiceHoursInput,
  type Paginated,
  Role,
  type ServiceHours,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { ServiceHoursService } from './service-hours.service';
import { decideServiceHoursSchema, logServiceHoursSchema } from './service-hours.schemas';

/** Roles that may decide a service-hours entry (RF18/RF19). */
const MANAGE_ROLES = [Role.Owner, Role.Administrator] as const;
/** Roles that may VIEW internally (manage roles + the read-only auditor). */
const VIEW_ROLES = [...MANAGE_ROLES, Role.ReadOnlyAuditor] as const;

/**
 * M08 service hours (RF18/RF19) — tenant-scoped (RLS). Logging is open to ANY
 * authenticated Person against their OWN accepted enrollment (cross-tenant by
 * design); deciding and viewing by enrollment internally is
 * Owner/Administrator (+ ReadOnlyAuditor for viewing).
 */
@Controller('service-hours')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ServiceHoursController {
  constructor(private readonly service: ServiceHoursService) {}

  /** Log a session — any authenticated Person (no @Roles gate). */
  @Post()
  create(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(logServiceHoursSchema)) dto: LogServiceHoursInput,
  ): Promise<ServiceHours> {
    return this.service.log(actor, dto);
  }

  @Get('mine')
  listMine(@CurrentUser() actor: RequestUser): Promise<ServiceHours[]> {
    return this.service.listMine(actor);
  }

  @Get()
  @Roles(...VIEW_ROLES)
  listByEnrollment(
    @Query('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<Paginated<ServiceHours>> {
    return this.service.listByEnrollment(enrollmentId, Number(limit), Number(offset));
  }

  @Post(':id/decision')
  @HttpCode(200)
  @Roles(...MANAGE_ROLES)
  decide(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(decideServiceHoursSchema)) dto: DecideServiceHoursInput,
  ): Promise<ServiceHours> {
    return this.service.decide(actor.id, id, dto);
  }
}

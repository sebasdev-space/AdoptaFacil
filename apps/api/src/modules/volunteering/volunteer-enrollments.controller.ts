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
  type CreateVolunteerEnrollmentInput,
  type DecideVolunteerEnrollmentInput,
  type Paginated,
  Role,
  type VolunteerEnrollment,
  VolunteerEnrollmentStatus,
  type VolunteerEnrollmentMine,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { VolunteerEnrollmentsService } from './volunteer-enrollments.service';
import {
  createVolunteerEnrollmentSchema,
  decideVolunteerEnrollmentSchema,
} from './volunteer-enrollments.schemas';

/** Roles that may decide/complete an enrollment (RF18). */
const MANAGE_ROLES = [Role.Owner, Role.Administrator] as const;
/** Roles that may VIEW internally (manage roles + the read-only auditor). */
const VIEW_ROLES = [...MANAGE_ROLES, Role.ReadOnlyAuditor] as const;

/**
 * M08 volunteer enrollments (RF18) — tenant-scoped (RLS). Enrolling is open to
 * ANY authenticated Person (the volunteer, cross-tenant by design); deciding
 * and viewing internally is Owner/Administrator (+ ReadOnlyAuditor for
 * viewing) — deny-by-default for everyone else.
 */
@Controller('volunteer-enrollments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VolunteerEnrollmentsController {
  constructor(private readonly service: VolunteerEnrollmentsService) {}

  /** Enroll in an opportunity — any authenticated Person (no @Roles gate). */
  @Post()
  create(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(createVolunteerEnrollmentSchema))
    dto: CreateVolunteerEnrollmentInput,
  ): Promise<VolunteerEnrollment> {
    return this.service.enroll(actor, dto.opportunityId);
  }

  @Get('mine')
  listMine(@CurrentUser() actor: RequestUser): Promise<VolunteerEnrollmentMine[]> {
    return this.service.listMine(actor);
  }

  @Get()
  @Roles(...VIEW_ROLES)
  list(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('opportunityId') opportunityId?: string,
    @Query('status') status?: VolunteerEnrollmentStatus,
  ): Promise<Paginated<VolunteerEnrollment>> {
    return this.service.list(Number(limit), Number(offset), { opportunityId, status });
  }

  @Get(':id')
  @Roles(...VIEW_ROLES)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<VolunteerEnrollment> {
    return this.service.get(id);
  }

  @Post(':id/decision')
  @HttpCode(200)
  @Roles(...MANAGE_ROLES)
  decide(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(decideVolunteerEnrollmentSchema))
    dto: DecideVolunteerEnrollmentInput,
  ): Promise<VolunteerEnrollment> {
    return this.service.decide(actor.id, id, dto);
  }

  @Post(':id/complete')
  @HttpCode(200)
  @Roles(...MANAGE_ROLES)
  complete(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VolunteerEnrollment> {
    return this.service.complete(actor.id, id);
  }
}

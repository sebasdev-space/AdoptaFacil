import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  type CreateSponsorshipPlanInput,
  type Paginated,
  Role,
  type SponsorshipPlan,
  type UpdateSponsorshipPlanInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { SponsorshipPlansService } from './sponsorship-plans.service';
import { createSponsorshipPlanSchema, updateSponsorshipPlanSchema } from './sponsorships.schemas';

/** Roles that may CREATE/EDIT/ARCHIVE a sponsorship plan (§13 M07). */
const WRITE_ROLES = [Role.Owner, Role.Administrator] as const;
/** Roles that may VIEW internally (write roles + the read-only auditor). */
const VIEW_ROLES = [...WRITE_ROLES, Role.ReadOnlyAuditor] as const;

/**
 * M07 sponsorship plans (RF17 · T-056) — tenant-scoped (RLS). Create/edit/archive
 * = Owner/Administrator; view = + ReadOnlyAuditor; everyone else denied
 * (deny-by-default). Subscribing to a plan is a separate, Person-facing endpoint
 * (see SponsorshipsController).
 */
@Controller('sponsorship-plans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SponsorshipPlansController {
  constructor(private readonly service: SponsorshipPlansService) {}

  @Post()
  @Roles(...WRITE_ROLES)
  create(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(createSponsorshipPlanSchema)) dto: CreateSponsorshipPlanInput,
  ): Promise<SponsorshipPlan> {
    return this.service.create(actor.id, dto);
  }

  @Get()
  @Roles(...VIEW_ROLES)
  list(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('animalId') animalId?: string,
  ): Promise<Paginated<SponsorshipPlan>> {
    return this.service.list(Number(limit), Number(offset), animalId);
  }

  @Get(':id')
  @Roles(...VIEW_ROLES)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<SponsorshipPlan> {
    return this.service.get(id);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSponsorshipPlanSchema)) dto: UpdateSponsorshipPlanInput,
  ): Promise<SponsorshipPlan> {
    return this.service.update(actor.id, id, dto);
  }
}

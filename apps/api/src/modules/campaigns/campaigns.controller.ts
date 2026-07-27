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
  type Campaign,
  type CreateCampaignInput,
  type Paginated,
  Role,
  type UpdateCampaignInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { CampaignsService } from './campaigns.service';
import { createCampaignSchema, updateCampaignSchema } from './campaigns.schemas';

/** Roles that may CREATE/EDIT a campaign (§13 M06). */
const WRITE_ROLES = [Role.Owner, Role.Administrator, Role.Operator] as const;
/** Roles that may VIEW internally (write roles + the read-only auditor). */
const VIEW_ROLES = [...WRITE_ROLES, Role.ReadOnlyAuditor] as const;

/**
 * M06 campaigns (RF15) — tenant-scoped (RLS). Create/edit/manage =
 * Owner/Administrator/Operator; view = + ReadOnlyAuditor; everyone else denied
 * (deny-by-default). Public exposure is a separate, unauthenticated controller.
 */
@Controller('campaigns')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CampaignsController {
  constructor(private readonly service: CampaignsService) {}

  @Post()
  @Roles(...WRITE_ROLES)
  create(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(createCampaignSchema)) dto: CreateCampaignInput,
  ): Promise<Campaign> {
    return this.service.create(actor.id, dto);
  }

  @Get()
  @Roles(...VIEW_ROLES)
  list(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<Paginated<Campaign>> {
    return this.service.list(Number(limit), Number(offset));
  }

  @Get(':id')
  @Roles(...VIEW_ROLES)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Campaign> {
    return this.service.get(id);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCampaignSchema)) dto: UpdateCampaignInput,
  ): Promise<Campaign> {
    return this.service.update(actor.id, id, dto);
  }
}

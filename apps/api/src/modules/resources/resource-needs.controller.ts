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
  Role,
  type CreateResourceNeedInput,
  type ResourceNeed,
  type ResourceNeedsOwnPage,
  type UpdateResourceNeedInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { ResourceNeedsService } from './resource-needs.service';
import { createResourceNeedSchema, updateResourceNeedSchema } from './resource-needs.schemas';

/** Roles that may PUBLISH/EDIT a need (M09). */
export const RESOURCE_WRITE_ROLES = [Role.Owner, Role.Administrator, Role.Operator] as const;
/** Roles that may VIEW internally (write roles + the read-only auditor). */
export const RESOURCE_VIEW_ROLES = [...RESOURCE_WRITE_ROLES, Role.ReadOnlyAuditor] as const;

/**
 * M09 (banco de recursos) — necesidades. Tenant-scoped (RLS). Publicar/editar
 * = Owner/Administrator/Operator; ver = + ReadOnlyAuditor; el resto, denegado
 * (deny-by-default). Exposición pública en un controller separado.
 */
@Controller('resources/needs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResourceNeedsController {
  constructor(private readonly service: ResourceNeedsService) {}

  @Post()
  @Roles(...RESOURCE_WRITE_ROLES)
  create(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(createResourceNeedSchema)) dto: CreateResourceNeedInput,
  ): Promise<ResourceNeed> {
    return this.service.create(actor.id, dto);
  }

  @Get()
  @Roles(...RESOURCE_VIEW_ROLES)
  list(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<ResourceNeedsOwnPage> {
    return this.service.list(Number(limit), Number(offset));
  }

  @Get(':id')
  @Roles(...RESOURCE_VIEW_ROLES)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ResourceNeed> {
    return this.service.get(id);
  }

  @Patch(':id')
  @Roles(...RESOURCE_WRITE_ROLES)
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateResourceNeedSchema)) dto: UpdateResourceNeedInput,
  ): Promise<ResourceNeed> {
    return this.service.update(actor.id, id, dto);
  }
}

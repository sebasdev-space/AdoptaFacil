import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  type CompleteResourceDeliveryInput,
  type ResourceDelivery,
  type ResourceDeliveriesPage,
  type ScheduleResourceDeliveryInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { ResourceDeliveriesService } from './resource-deliveries.service';
import {
  completeResourceDeliverySchema,
  scheduleResourceDeliverySchema,
} from './resource-deliveries.schemas';
import { RESOURCE_VIEW_ROLES, RESOURCE_WRITE_ROLES } from './resource-needs.controller';

/**
 * M09 — entregas. Siempre de la organización BENEFICIARIA (tenant-scoped,
 * RLS); se crean al aceptar una oferta (`ResourceOffersController`), nunca
 * directamente aquí. Coordinar/cerrar = Owner/Administrator/Operator; ver =
 * + ReadOnlyAuditor; el resto, denegado.
 */
@Controller('resources/deliveries')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResourceDeliveriesController {
  constructor(private readonly service: ResourceDeliveriesService) {}

  @Get()
  @Roles(...RESOURCE_VIEW_ROLES)
  list(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<ResourceDeliveriesPage> {
    return this.service.list(Number(limit), Number(offset));
  }

  @Get(':id')
  @Roles(...RESOURCE_VIEW_ROLES)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ResourceDelivery> {
    return this.service.get(id);
  }

  @Patch(':id')
  @Roles(...RESOURCE_WRITE_ROLES)
  updateSchedule(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(scheduleResourceDeliverySchema)) dto: ScheduleResourceDeliveryInput,
  ): Promise<ResourceDelivery> {
    return this.service.updateSchedule(actor.id, id, dto);
  }

  @Patch(':id/complete')
  @Roles(...RESOURCE_WRITE_ROLES)
  complete(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(completeResourceDeliverySchema)) dto: CompleteResourceDeliveryInput,
  ): Promise<ResourceDelivery> {
    return this.service.complete(actor.id, id, dto);
  }

  @Patch(':id/cancel')
  @Roles(...RESOURCE_WRITE_ROLES)
  cancel(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ResourceDelivery> {
    return this.service.cancel(actor.id, id);
  }
}

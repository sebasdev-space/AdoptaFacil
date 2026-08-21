import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  type CreateResourceDeliveryEvidenceInput,
  type ResourceDeliveryEvidence,
  type ResourceDeliveryEvidenceUploadResult,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { ResourceDeliveryEvidencesService } from './resource-delivery-evidences.service';
import { createResourceDeliveryEvidenceSchema } from './resource-delivery-evidences.schemas';
import { RESOURCE_VIEW_ROLES, RESOURCE_WRITE_ROLES } from './resource-needs.controller';

/**
 * M09 — evidencia fotográfica de una entrega, anidada bajo su id. Subir/
 * eliminar = Owner/Administrator/Operator; ver = + ReadOnlyAuditor.
 */
@Controller('resources/deliveries/:deliveryId/evidences')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ResourceDeliveryEvidencesController {
  constructor(private readonly service: ResourceDeliveryEvidencesService) {}

  @Post()
  @Roles(...RESOURCE_WRITE_ROLES)
  create(
    @CurrentUser() actor: RequestUser,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Body(new ZodValidationPipe(createResourceDeliveryEvidenceSchema))
    dto: CreateResourceDeliveryEvidenceInput,
  ): Promise<ResourceDeliveryEvidenceUploadResult> {
    return this.service.create(actor.id, deliveryId, dto);
  }

  @Get()
  @Roles(...RESOURCE_VIEW_ROLES)
  list(
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ): Promise<ResourceDeliveryEvidence[]> {
    return this.service.list(deliveryId);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(...RESOURCE_WRITE_ROLES)
  async remove(
    @CurrentUser() actor: RequestUser,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.service.remove(actor.id, deliveryId, id);
  }
}

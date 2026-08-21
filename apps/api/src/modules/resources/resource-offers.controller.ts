import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  type CreateResourceOfferInput,
  type DecideResourceOfferInput,
  type ResourceOffer,
  type ResourceOfferWithNeed,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { ResourceOffersService } from './resource-offers.service';
import { createResourceOfferSchema, decideResourceOfferSchema } from './resource-offers.schemas';
import { RESOURCE_VIEW_ROLES, RESOURCE_WRITE_ROLES } from './resource-needs.controller';

/**
 * M09 — ofertas de donación física. Audiencias:
 *   - cualquier autenticado OFRECE cubrir una necesidad (`POST`) o cancela
 *     SU PROPIA oferta pendiente (`PATCH :id/cancel`) — cross-tenant, por
 *     identidad, mismo patrón que M05 `DonationsController`;
 *   - la organización BENEFICIARIA lista lo recibido (`GET received`) y
 *     decide (`PATCH :id/decision`) — deny-by-default, RESOURCE_WRITE_ROLES;
 *   - el donante lista lo suyo (`GET mine`) — cross-tenant, por identidad.
 */
@Controller('resources/offers')
export class ResourceOffersController {
  constructor(private readonly service: ResourceOffersService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(createResourceOfferSchema)) dto: CreateResourceOfferInput,
  ): Promise<ResourceOffer> {
    return this.service.create(actor, dto);
  }

  @Get('received')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...RESOURCE_VIEW_ROLES)
  listReceived(): Promise<ResourceOffer[]> {
    return this.service.listReceived();
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  listMine(@CurrentUser() actor: RequestUser): Promise<ResourceOfferWithNeed[]> {
    return this.service.listMine(actor);
  }

  @Patch(':id/decision')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...RESOURCE_WRITE_ROLES)
  decide(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(decideResourceOfferSchema)) dto: DecideResourceOfferInput,
  ): Promise<ResourceOffer> {
    return this.service.decide(actor.id, id, dto);
  }

  @Patch(':id/cancel')
  @UseGuards(JwtAuthGuard)
  cancel(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ResourceOffer> {
    return this.service.cancel(actor, id);
  }
}

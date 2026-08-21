import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { ResourceNeedsController } from './resource-needs.controller';
import { ResourceNeedsService } from './resource-needs.service';
import { ResourceOffersController } from './resource-offers.controller';
import { ResourceOffersService } from './resource-offers.service';
import { ResourceDeliveriesController } from './resource-deliveries.controller';
import { ResourceDeliveriesService } from './resource-deliveries.service';
import { ResourceDeliveryEvidencesController } from './resource-delivery-evidences.controller';
import { ResourceDeliveryEvidencesService } from './resource-delivery-evidences.service';
import { PublicResourceNeedsController } from './public-resource-needs.controller';
import { PublicResourceNeedsService } from './public-resource-needs.service';

/**
 * M09 · Banco de recursos (Ola 3): una organización publica una NECESIDAD; un
 * donante OFRECE cubrirla (donación física, sin PaymentPort — sin
 * dependencias cruzadas); al aceptarse la oferta se crea una ENTREGA que la
 * organización coordina y cierra con evidencia fotográfica (StoragePort).
 * Tenant-scoped (RLS) salvo la creación/lectura de ofertas por el donante
 * (cross-tenant por identidad, SECURITY DEFINER — mismo patrón que M05
 * `Donation`) y el catálogo público de necesidades. Consumes core
 * (tenant/auth/rbac/audit/storage) — global providers; AuthModule solo para
 * el JwtAuthGuard.
 */
@Module({
  imports: [AuthModule],
  controllers: [
    ResourceNeedsController,
    ResourceOffersController,
    ResourceDeliveriesController,
    ResourceDeliveryEvidencesController,
    PublicResourceNeedsController,
  ],
  providers: [
    ResourceNeedsService,
    ResourceOffersService,
    ResourceDeliveriesService,
    ResourceDeliveryEvidencesService,
    PublicResourceNeedsService,
  ],
})
export class ResourcesModule {}

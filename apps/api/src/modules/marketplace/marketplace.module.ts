import { Module } from '@nestjs/common';
import { AuthModule } from '../../core/auth/auth.module';
import { MarketplaceProductsController } from './marketplace-products.controller';
import { MarketplaceProductsService } from './marketplace-products.service';
import { PublicMarketplaceProductsController } from './public-marketplace-products.controller';
import { PublicMarketplaceProductsService } from './public-marketplace-products.service';

/**
 * M10 · Marketplace simplificado (Ola 3): catálogo de productos físicos por
 * organización, contacto por WhatsApp — sin carrito, sin checkout, sin
 * dependencia del PaymentPort. Tenant-scoped (RLS) salvo el catálogo público.
 * Consumes core (tenant/auth/rbac/audit/storage) — global providers;
 * AuthModule solo para el JwtAuthGuard.
 */
@Module({
  imports: [AuthModule],
  controllers: [MarketplaceProductsController, PublicMarketplaceProductsController],
  providers: [MarketplaceProductsService, PublicMarketplaceProductsService],
})
export class MarketplaceModule {}

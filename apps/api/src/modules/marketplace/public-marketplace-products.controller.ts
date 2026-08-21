import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ProductCategory,
  type ProductPublic,
  type ProductsPublicPage,
} from '@adoptafacil/contracts';
import { PublicMarketplaceProductsService } from './public-marketplace-products.service';

function parseCategory(value?: string): ProductCategory | undefined {
  return value && (Object.values(ProductCategory) as string[]).includes(value)
    ? (value as ProductCategory)
    : undefined;
}

/**
 * M10 (marketplace simplificado) — catálogo PÚBLICO de productos, sin
 * autenticación (patrón T-052/M09). Filtro opcional por categoría y/o
 * organización. El comprador contacta a la organización por WhatsApp — no
 * hay carrito ni checkout en la plataforma.
 */
@Controller('public/marketplace/products')
export class PublicMarketplaceProductsController {
  constructor(private readonly service: PublicMarketplaceProductsService) {}

  @Get()
  list(
    @Query('category') category?: string,
    @Query('organizationId') organizationId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<ProductsPublicPage> {
    return this.service.list(
      Number(limit),
      Number(offset),
      parseCategory(category),
      organizationId,
    );
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<ProductPublic> {
    const found = await this.service.get(id);
    if (!found) {
      throw new NotFoundException('Product not found');
    }
    return found;
  }
}

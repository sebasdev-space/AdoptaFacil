import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ProductCategory,
  Role,
  type CreateProductInput,
  type Product,
  type ProductImageUploadResult,
  type ProductsPage,
  type UpdateProductInput,
} from '@adoptafacil/contracts';
import type { RequestUser } from '../../core/auth/auth.types';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JwtAuthGuard } from '../../core/auth/jwt-auth.guard';
import { ZodValidationPipe } from '../../core/auth/zod-validation.pipe';
import { Roles } from '../../core/rbac/roles.decorator';
import { RolesGuard } from '../../core/rbac/roles.guard';
import { MarketplaceProductsService } from './marketplace-products.service';
import {
  addProductImageSchema,
  createProductSchema,
  updateProductSchema,
} from './marketplace-products.schemas';

/** Roles that may PUBLISH/EDIT a product (M10). */
export const MARKETPLACE_WRITE_ROLES = [Role.Owner, Role.Administrator, Role.Operator] as const;
/** Roles that may VIEW internally (write roles + the read-only auditor). */
export const MARKETPLACE_VIEW_ROLES = [...MARKETPLACE_WRITE_ROLES, Role.ReadOnlyAuditor] as const;

interface ImageDto {
  filename: string;
  contentType?: string;
  order?: number;
}

function parseCategory(value?: string): ProductCategory | undefined {
  return value && (Object.values(ProductCategory) as string[]).includes(value)
    ? (value as ProductCategory)
    : undefined;
}

/**
 * M10 (marketplace simplificado) — catálogo de productos de la organización.
 * Tenant-scoped (RLS). Publicar/editar = Owner/Administrator/Operator; ver =
 * + ReadOnlyAuditor; el resto, denegado (deny-by-default). Exposición pública
 * en un controller separado.
 */
@Controller('marketplace/products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MarketplaceProductsController {
  constructor(private readonly service: MarketplaceProductsService) {}

  @Post()
  @Roles(...MARKETPLACE_WRITE_ROLES)
  create(
    @CurrentUser() actor: RequestUser,
    @Body(new ZodValidationPipe(createProductSchema)) dto: CreateProductInput,
  ): Promise<Product> {
    return this.service.create(actor.id, dto);
  }

  @Get()
  @Roles(...MARKETPLACE_VIEW_ROLES)
  list(
    @Query('category') category?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<ProductsPage> {
    return this.service.list({
      category: parseCategory(category),
      includeInactive: includeInactive === 'true',
      limit: Number(limit),
      offset: Number(offset),
    });
  }

  @Get(':id')
  @Roles(...MARKETPLACE_VIEW_ROLES)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Product> {
    return this.service.get(id);
  }

  @Patch(':id')
  @Roles(...MARKETPLACE_WRITE_ROLES)
  update(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) dto: UpdateProductInput,
  ): Promise<Product> {
    return this.service.update(actor.id, id, dto);
  }

  @Post(':id/images')
  @Roles(...MARKETPLACE_WRITE_ROLES)
  addImage(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(addProductImageSchema)) dto: ImageDto,
  ): Promise<ProductImageUploadResult> {
    return this.service.addImage(actor.id, id, dto);
  }

  @Delete(':id/images/:imageId')
  @Roles(...MARKETPLACE_WRITE_ROLES)
  @HttpCode(204)
  removeImage(
    @CurrentUser() actor: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ): Promise<void> {
    return this.service.removeImage(actor.id, id, imageId);
  }
}

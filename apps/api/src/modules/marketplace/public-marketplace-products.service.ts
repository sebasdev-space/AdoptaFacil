import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type ProductCategory,
  type ProductImage,
  type ProductPublic,
  type ProductsPublicPage,
} from '@adoptafacil/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import { STORAGE_PORT, type StoragePort } from '../../core/storage/storage.port';
import { clampLimit } from './marketplace-products.service';

/** Raw public image entry emitted by the SECURITY DEFINER functions — keys
 *  are camelCase because the SQL `jsonb_build_object` calls define them, not
 *  raw column names. */
interface RawPublicImage {
  id: string;
  storageRef: string;
  order: number;
}

/** Raw public product row emitted by `public_products`/`public_product`. */
interface RawPublicProduct {
  id: string;
  organizationId: string;
  organizationName: string;
  organizationWhatsapp: string | null;
  name: string;
  description: string | null;
  category: string;
  price: number;
  stock: number;
  images: RawPublicImage[];
  createdAt: string;
}

function toPublic(raw: RawPublicProduct, storage: StoragePort): ProductPublic {
  const images: ProductImage[] = [...(raw.images ?? [])]
    .sort((a, b) => a.order - b.order)
    .map((i) => ({
      id: i.id,
      storageRef: i.storageRef,
      order: i.order,
      url: storage.resolvePublicUrl(i.storageRef),
    }));
  return {
    id: raw.id,
    organizationId: raw.organizationId,
    organizationName: raw.organizationName,
    organizationWhatsapp: raw.organizationWhatsapp ?? undefined,
    name: raw.name,
    description: raw.description ?? undefined,
    category: raw.category as ProductCategory,
    price: raw.price,
    stock: raw.stock,
    images,
    createdAt: raw.createdAt,
  };
}

/**
 * PUBLIC (no-session) product reads for the marketplace catalog (M10). Cross-
 * tenant exposure goes through bounded SECURITY DEFINER functions
 * (`public_products`/`public_product`) — never a raw RLS-evading select — so
 * only public columns (+ org name/WhatsApp) ever leave the DB. Mirrors
 * `PublicResourceNeedsService`/`PublicCampaignsService`.
 */
@Injectable()
export class PublicMarketplaceProductsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  /** Active products across organizations (paginated), optionally filtered
   *  by category and/or organization. */
  async list(
    limit: number,
    offset: number,
    category?: ProductCategory,
    organizationId?: string,
  ): Promise<ProductsPublicPage> {
    const take = clampLimit(limit);
    const skip = Math.max(offset || 0, 0);
    const rows = await this.prisma.$queryRaw<
      Array<{ data: { items: RawPublicProduct[]; total: number } }>
    >(
      Prisma.sql`SELECT public_products(${take}::int, ${skip}::int, ${category ?? null}::text, ${organizationId ?? null}::uuid) AS data`,
    );
    const data = rows[0]?.data ?? { items: [], total: 0 };
    return {
      items: (data.items ?? []).map((r) => toPublic(r, this.storage)),
      total: data.total ?? 0,
      limit: take,
      offset: skip,
    };
  }

  /** One active public product by id, or null. */
  async get(id: string): Promise<ProductPublic | null> {
    const rows = await this.prisma.$queryRaw<Array<{ data: RawPublicProduct | null }>>(
      Prisma.sql`SELECT public_product(${id}::uuid) AS data`,
    );
    const raw = rows[0]?.data ?? null;
    return raw ? toPublic(raw, this.storage) : null;
  }
}

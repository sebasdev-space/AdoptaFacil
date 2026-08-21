// Module: M10 marketplace · Contracts owner: @fabian
//
// Simplified marketplace (Consolidación operativa, M10): a per-organization
// catalog of physical products, contacted OFF-PLATFORM via WhatsApp — NO cart,
// NO checkout, NO PaymentPort dependency (the sale itself happens between the
// buyer and the organization; the platform is not a party to it). Every
// product surface (management and public) must show the delivery/quality
// non-guarantee notice. Money is INTEGER COP pesos (never float), coherent
// with campaigns/donations.

/**
 * Product category — CLOSED list. Stable string values; the Spanish label is
 * a UI concern. Do NOT invent new categories.
 * - `food`        — alimento
 * - `accessories` — accesorios
 * - `medicine`    — medicamentos
 * - `hygiene`     — higiene
 * - `toys`        — juguetes
 * - `other`       — otros
 */
export enum ProductCategory {
  Food = 'food',
  Accessories = 'accessories',
  Medicine = 'medicine',
  Hygiene = 'hygiene',
  Toys = 'toys',
  Other = 'other',
}

/** Allowed categories, exported for validation and UI dropdowns. */
export const PRODUCT_CATEGORIES: readonly ProductCategory[] = [
  ProductCategory.Food,
  ProductCategory.Accessories,
  ProductCategory.Medicine,
  ProductCategory.Hygiene,
  ProductCategory.Toys,
  ProductCategory.Other,
];

/**
 * A photo attached to a product. Only METADATA is persisted (storage ref +
 * order); the image bytes live behind the StoragePort adapter. `url` is
 * resolved for presentation, not stored.
 */
export interface ProductImage {
  id: string;
  storageRef: string;
  /** 0-based display order; the first is the primary photo. */
  order: number;
  /** Resolved public URL for display (derived, not persisted). */
  url: string;
}

/**
 * A product listed by an organization (internal projection). Soft-managed via
 * `isActive` (never physically deleted) — a deactivated product disappears
 * from both the org's default list and the public catalog without losing its
 * history.
 */
export interface Product {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  category: ProductCategory;
  /** Integer COP pesos, > 0. */
  price: number;
  /** Units available, >= 0. */
  stock: number;
  isActive: boolean;
  images: ProductImage[];
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. */
  updatedAt: string;
}

/**
 * Public projection of a product for the marketplace catalog — no internal
 * fields, plus the owning org's display name and WhatsApp contact number (the
 * buyer reaches out off-platform; there is no in-app checkout).
 */
export interface ProductPublic {
  id: string;
  organizationId: string;
  organizationName: string;
  /** The org's WhatsApp contact number, when set (§org.whatsapp). */
  organizationWhatsapp?: string;
  name: string;
  description?: string;
  category: ProductCategory;
  price: number;
  stock: number;
  images: ProductImage[];
  /** ISO-8601 UTC. */
  createdAt: string;
}

/** Reserve a photo for a product. Only metadata is stored; the client PUTs
 *  the bytes to the returned StoragePort target. */
export interface ProductImageInput {
  filename: string;
  contentType?: string;
  /** Explicit 0-based order; defaults to appended at the end. */
  order?: number;
}

/** Publish a product. Fails with a conflict if an active product with the
 *  same name already exists in this organization. `stock` defaults to 0. */
export interface CreateProductInput {
  name: string;
  description?: string;
  category: ProductCategory;
  /** Integer COP pesos, > 0. */
  price: number;
  /** Units available, >= 0. Defaults to 0. */
  stock?: number;
  images?: ProductImageInput[];
}

/** Patch a product. All fields optional; only provided fields change.
 *  `isActive: false` hides it from the org's default list and from the
 *  public catalog without deleting it. */
export interface UpdateProductInput {
  name?: string;
  description?: string;
  category?: ProductCategory;
  price?: number;
  stock?: number;
  isActive?: boolean;
}

/** Result of reserving a product photo: the stored metadata + the simulable
 *  storage target the client PUTs the bytes to. */
export interface ProductImageUploadResult {
  image: ProductImage;
  upload: {
    url: string;
    key: string;
  };
}

/** Paginated page of the organization's own products (limit/offset, capped
 *  server-side). */
export interface ProductsPage {
  items: Product[];
  total: number;
  limit: number;
  offset: number;
}

/** Paginated page of the public catalog (limit/offset, capped server-side). */
export interface ProductsPublicPage {
  items: ProductPublic[];
  total: number;
  limit: number;
  offset: number;
}

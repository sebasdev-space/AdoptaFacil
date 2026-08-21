import { ProductCategory } from '@adoptafacil/contracts';

/** Etiquetas legibles (es-CO) de las categorías — enum CERRADO del contrato
 *  (M10). No se inventan categorías fuera del enum. */
export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  [ProductCategory.Food]: 'Alimento',
  [ProductCategory.Accessories]: 'Accesorios',
  [ProductCategory.Medicine]: 'Medicamentos',
  [ProductCategory.Hygiene]: 'Higiene',
  [ProductCategory.Toys]: 'Juguetes',
  [ProductCategory.Other]: 'Otros',
};

/** Formatea pesos enteros COP (sin decimales), es-CO. Duplicado a propósito
 *  (mismo patrón que `campaigns/model/campaigns-view.ts`), no compartido. */
export function formatCop(pesos: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(pesos);
}

/** Presenta un ISO-8601 UTC en hora Colombia (UTC en almacenamiento, CO en UI). */
export function formatBogota(isoUtc: string): string {
  const date = new Date(isoUtc);
  if (Number.isNaN(date.getTime())) return isoUtc;
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'medium',
  }).format(date);
}

/** Texto de disponibilidad a partir del stock — nunca inventa una promesa de
 *  entrega (RF market M10: el aviso de no garantía es SEPARADO de esto). */
export function stockLabel(stock: number): string {
  if (stock <= 0) return 'Sin stock';
  if (stock === 1) return '1 disponible';
  return `${stock} disponibles`;
}

/** Enlace al detalle público de un producto. */
export function publicProductHref(id: string): string {
  return `/marketplace/${encodeURIComponent(id)}`;
}

/** Enlace de gestión interna de un producto (organización). */
export function manageProductHref(id: string): string {
  return `/organizacion/marketplace/${encodeURIComponent(id)}`;
}

/**
 * Construye un enlace `wa.me` a partir del WhatsApp de la organización y un
 * mensaje precargado. `wa.me` solo acepta dígitos (sin `+`, espacios ni
 * guiones) — se limpia el número tal cual llega del backend
 * (`OrganizationProfile.whatsapp`, sin formato garantizado). `null` cuando no
 * quedan dígitos (la org no configuró WhatsApp o el valor es inservible).
 */
export function buildWhatsappUrl(whatsapp: string | undefined, message: string): string | null {
  const digits = (whatsapp ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** Mensaje precargado para contactar a la organización por un producto. */
export function contactMessage(productName: string, organizationName: string): string {
  return `Hola ${organizationName}, vi "${productName}" en AdoptaFácil y quiero saber más.`;
}

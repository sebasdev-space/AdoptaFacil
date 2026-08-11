import type { Organization } from '@adoptafacil/contracts';

/**
 * % de perfil completo para el subtítulo de "Perfil de la organización".
 *
 * MOCK client-side: el backend no expone (todavía) esta métrica — ni en
 * `Organization` ni en `GET /org/summary` (S2-08). Heurística simple: fracción
 * de campos de perfil público con contenido, sin ponderar por importancia.
 * TODO(client): reemplazar por un valor real cuando el backend lo calcule; no
 * hay una definición de negocio de qué campos "cuentan" ni con qué peso.
 */
const COMPLETENESS_CHECKS: Array<(org: Organization) => boolean> = [
  (org) => Boolean(org.name?.trim()),
  (org) => Boolean(org.slug?.trim()),
  (org) => Boolean(org.nit?.trim()),
  (org) => Boolean(org.legalName?.trim()),
  (org) => Boolean(org.description?.trim()),
  (org) => Boolean(org.location?.department?.trim()),
  (org) => Boolean(org.location?.city?.trim()),
  (org) => Boolean(org.location?.address?.trim()),
  (org) => Boolean(org.contactEmail?.trim()),
  (org) => Boolean(org.whatsapp?.trim() || org.phone?.trim()),
  (org) => Boolean(org.logoUrl?.trim()),
  (org) => Boolean(org.coverPhotos?.[0]?.trim()),
  (org) =>
    Boolean(
      org.socialLinks?.instagram ||
      org.socialLinks?.facebook ||
      org.socialLinks?.tiktok ||
      org.socialLinks?.website,
    ),
  (org) => Boolean(org.aboutUs?.trim()),
  (org) =>
    Boolean(
      org.extendedContact?.hours ||
      org.extendedContact?.fullAddress ||
      org.extendedContact?.mapUrl ||
      org.extendedContact?.additionalPhones?.length,
    ),
];

export function computeProfileCompletenessMock(org: Organization): number {
  const filled = COMPLETENESS_CHECKS.filter((check) => check(org)).length;
  return Math.round((filled / COMPLETENESS_CHECKS.length) * 100);
}

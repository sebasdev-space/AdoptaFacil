import type { Organization } from '@adoptafacil/contracts';

/**
 * S2-05 — real completeness meter for the "Mi organización" top bar. The
 * field list is OURS to define (the Prompt Spec explicitly rejects copying
 * the mock's arbitrary `camposLlenos = 7`/`camposTotal = 9` constants): each
 * entry below maps directly to a field already in `Organization`
 * (`packages/contracts/src/org.ts`) and to RF01's own list of what a
 * presentable profile needs ("perfil/logo/fotos/ubicación/redes/WhatsApp").
 * `name` is technically always non-empty (backend requires it), but it still
 * counts here so a profile that only has its mandatory name reads as "mostly
 * empty" rather than starting the ring already partway full.
 */
export interface ProfileCompletenessField {
  key: string;
  label: string;
  isFilled: (org: Organization) => boolean;
}

export const PROFILE_COMPLETENESS_FIELDS: readonly ProfileCompletenessField[] = [
  { key: 'name', label: 'Nombre', isFilled: (org) => !!org.name?.trim() },
  { key: 'description', label: 'Descripción', isFilled: (org) => !!org.description?.trim() },
  { key: 'logoUrl', label: 'Logo', isFilled: (org) => !!org.logoUrl?.trim() },
  {
    key: 'coverPhotos',
    label: 'Portada',
    isFilled: (org) => (org.coverPhotos?.length ?? 0) > 0 && !!org.coverPhotos?.[0]?.trim(),
  },
  { key: 'city', label: 'Ciudad', isFilled: (org) => !!org.location?.city?.trim() },
  {
    key: 'contactChannel',
    label: 'Correo o WhatsApp',
    isFilled: (org) => !!(org.contactEmail?.trim() || org.whatsapp?.trim()),
  },
  {
    key: 'socialLinks',
    label: 'Redes sociales',
    isFilled: (org) =>
      !!org.socialLinks && Object.values(org.socialLinks).some((value) => !!value?.trim()),
  },
  { key: 'aboutUs', label: 'Acerca de nosotros', isFilled: (org) => !!org.aboutUs?.trim() },
  { key: 'slug', label: 'Slug del portal', isFilled: (org) => !!org.slug?.trim() },
];

export interface ProfileCompleteness {
  filled: number;
  total: number;
  percent: number;
  missingLabels: string[];
}

export function computeProfileCompleteness(org: Organization): ProfileCompleteness {
  const missingLabels: string[] = [];
  let filled = 0;
  for (const field of PROFILE_COMPLETENESS_FIELDS) {
    if (field.isFilled(org)) {
      filled += 1;
    } else {
      missingLabels.push(field.label);
    }
  }
  const total = PROFILE_COMPLETENESS_FIELDS.length;
  return { filled, total, percent: Math.round((filled / total) * 100), missingLabels };
}

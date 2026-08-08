import type {
  Organization,
  OrganizationExtendedContact,
  UpdateOrganizationProfileInput,
} from '@adoptafacil/contracts';
import { COLOMBIA } from '../data/colombian-locations';

/**
 * Draft state for the whole "Mi organización" editor (S2-05). Extracted from
 * the old single-card `org-profile-form.tsx` so it can be shared between the
 * top bar (Guardar cambios / live preview) and the 5 tabs — SAME fields, SAME
 * `PUT /org/profile` payload shape as before the redesign, only relocated.
 */
export interface FormState {
  name: string;
  slug: string;
  nit: string;
  legalName: string;
  description: string;
  contactEmail: string;
  whatsapp: string;
  phone: string;
  logoUrl: string;
  coverUrl: string;
  department: string;
  city: string;
  address: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  website: string;
  aboutUs: string;
  contactHours: string;
  contactFullAddress: string;
  contactMapUrl: string;
  contactPhones: string;
}

/** "a, b\nc" → ["a", "b", "c"] — separadas por coma O por línea, vacías descartadas. */
export function parsePhones(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((phone) => phone.trim())
    .filter(Boolean);
}

export function initialFormState(org: Organization): FormState {
  const contact = org.extendedContact;
  return {
    name: org.name ?? '',
    slug: org.slug ?? '',
    nit: org.nit ?? '',
    legalName: org.legalName ?? '',
    description: org.description ?? '',
    contactEmail: org.contactEmail ?? '',
    whatsapp: org.whatsapp ?? '',
    phone: org.phone ?? '',
    logoUrl: org.logoUrl ?? '',
    coverUrl: org.coverPhotos?.[0] ?? '',
    department: org.location?.department ?? '',
    city: org.location?.city ?? '',
    address: org.location?.address ?? '',
    instagram: org.socialLinks?.instagram ?? '',
    facebook: org.socialLinks?.facebook ?? '',
    tiktok: org.socialLinks?.tiktok ?? '',
    website: org.socialLinks?.website ?? '',
    aboutUs: org.aboutUs ?? '',
    contactHours: contact?.hours ?? '',
    contactFullAddress: contact?.fullAddress ?? '',
    contactMapUrl: contact?.mapUrl ?? '',
    contactPhones: contact?.additionalPhones?.join(', ') ?? '',
  };
}

/**
 * Trim only — an emptied field is sent as `""`, not omitted (T-D05 fix).
 *
 * BUG FOUND (T-D05 P0): the previous helper mapped an emptied field to
 * `undefined`, and Prisma's `update()`/`upsert().update` treat a key whose
 * value is `undefined` as "leave this column unchanged" (not "clear it"). So a
 * user who deleted the text in e.g. "Teléfono" and clicked Guardar got a
 * success toast, but the PUT never sent `phone` at all — the old value
 * silently survived server-side. Safe ONLY for backend fields with no extra
 * format validator (plain `shortText()` in `org.schemas.ts`): nit, legalName,
 * description, whatsapp, phone, and the four `location` fields all accept an
 * empty string.
 */
export function cleanText(value: string): string {
  return value.trim();
}

/**
 * Trim; return undefined when empty — REQUIRED (not just a style choice) for
 * fields the backend format-validates (`url()`/`email()`/the `slug` regex+min
 * in `org.schemas.ts`): those validators reject an empty string with a 400, so
 * omitting the key is the only way to say "no value" for them. Clearing one of
 * these fields entirely is a known remaining limitation — see the T-D05 report.
 */
export function cleanFormatted(value: string): string | undefined {
  const v = value.trim();
  return v ? v : undefined;
}

/**
 * Always an object (never `undefined`) — same "don't silently no-op a clear"
 * lesson as `cleanText` above, applied to a JSON column: `organization_profiles
 * .extended_contact` is fully REPLACED on every PUT (Prisma JSON columns don't
 * merge), so a sub-field simply omitted here is correctly cleared server-side —
 * but the FULL update itself must never be a bare `undefined`, or the whole
 * object would silently survive unchanged if the user clears every sub-field.
 */
export function extendedContactFromForm(form: FormState): OrganizationExtendedContact {
  const additionalPhones = parsePhones(form.contactPhones);
  return {
    ...(form.contactHours.trim() ? { hours: form.contactHours.trim() } : {}),
    ...(form.contactFullAddress.trim() ? { fullAddress: form.contactFullAddress.trim() } : {}),
    ...(form.contactMapUrl.trim() ? { mapUrl: form.contactMapUrl.trim() } : {}),
    ...(additionalPhones.length > 0 ? { additionalPhones } : {}),
  };
}

export function buildProfilePayload(form: FormState): UpdateOrganizationProfileInput {
  const location = {
    // Fixed — the platform is Colombia-only (base document); not user-editable.
    country: COLOMBIA,
    department: cleanText(form.department),
    city: cleanText(form.city),
    address: cleanText(form.address),
  };
  const socialLinks = {
    instagram: cleanFormatted(form.instagram),
    facebook: cleanFormatted(form.facebook),
    tiktok: cleanFormatted(form.tiktok),
    website: cleanFormatted(form.website),
  };
  const hasAnySocialLink = Object.values(socialLinks).some((v) => v !== undefined);

  return {
    // `validate()` already blocks submission unless `name` is non-empty.
    name: form.name.trim(),
    slug: cleanFormatted(form.slug),
    nit: cleanText(form.nit),
    legalName: cleanText(form.legalName),
    description: cleanText(form.description),
    contactEmail: cleanFormatted(form.contactEmail),
    whatsapp: cleanText(form.whatsapp),
    phone: cleanText(form.phone),
    logoUrl: cleanFormatted(form.logoUrl),
    coverPhotos: form.coverUrl.trim() ? [form.coverUrl.trim()] : [],
    location,
    ...(hasAnySocialLink ? { socialLinks } : {}),
    aboutUs: cleanText(form.aboutUs),
    extendedContact: extendedContactFromForm(form),
  };
}

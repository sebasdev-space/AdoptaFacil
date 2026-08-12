import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type {
  Organization,
  OrganizationExtendedContact,
  UpdateOrganizationProfileInput,
} from '@adoptafacil/contracts';
import { useToast } from '@adoptafacil/ui';
import { useApiClient, type ApiClient } from '../../../shell/api';
import {
  COLOMBIA,
  DEPARTMENTS,
  OTHER_CITY_VALUE,
  citiesForDepartment,
} from '../data/colombian-locations';
import { IMAGE_ACCEPT, uploadFileBytes, validateUpload } from '../lib/storage';
import {
  OrgSelectField,
  OrgStaticField,
  OrgTextAreaField,
  OrgTextField,
} from './org-profile-fields';
import { OrgTabPanel, OrgTabsNav, type OrgTabItem } from './org-tabs';
import {
  slugify,
  validateOptionalEmail,
  validateOptionalSlug,
  validateOptionalUrl,
} from '../validation';
import styles from './org-profile-form.module.scss';

const ABOUT_US_MAX = 2000;

const TABS: OrgTabItem[] = [
  { value: 'institucional', label: 'Datos institucionales' },
  { value: 'ubicacion', label: 'Ubicación' },
  { value: 'contacto', label: 'Contacto' },
  { value: 'imagenes', label: 'Imágenes y redes' },
  { value: 'nosotros', label: 'Acerca de nosotros' },
];

/** "a, b\nc" → ["a", "b", "c"] — separadas por coma O por línea, vacías descartadas. */
function parsePhones(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((phone) => phone.trim())
    .filter(Boolean);
}

interface FormState {
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
  // S2-REORG: movidos desde la página de Personalización — se guardan con el
  // MISMO endpoint (PUT /org/profile) que el resto de este formulario; solo
  // cambió DÓNDE se editan, nunca dónde se persisten (ya vivían en
  // organization_profiles.about_us/extended_contact desde S2-PORTAL).
  aboutUs: string;
  contactHours: string;
  contactFullAddress: string;
  contactMapUrl: string;
  contactPhones: string;
}

function initialState(org: Organization): FormState {
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
function cleanText(value: string): string {
  return value.trim();
}

/**
 * Trim; return undefined when empty — REQUIRED (not just a style choice) for
 * fields the backend format-validates (`url()`/`email()`/the `slug` regex+min
 * in `org.schemas.ts`): those validators reject an empty string with a 400, so
 * omitting the key is the only way to say "no value" for them. Clearing one of
 * these fields entirely is a known remaining limitation — see the T-D05 report.
 */
function cleanFormatted(value: string): string | undefined {
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
function extendedContactFromForm(form: FormState): OrganizationExtendedContact {
  const additionalPhones = parsePhones(form.contactPhones);
  return {
    ...(form.contactHours.trim() ? { hours: form.contactHours.trim() } : {}),
    ...(form.contactFullAddress.trim() ? { fullAddress: form.contactFullAddress.trim() } : {}),
    ...(form.contactMapUrl.trim() ? { mapUrl: form.contactMapUrl.trim() } : {}),
    ...(additionalPhones.length > 0 ? { additionalPhones } : {}),
  };
}

function buildPayload(form: FormState): UpdateOrganizationProfileInput {
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

interface UploadTargetResult {
  url: string;
  key: string;
}

/** Reserve a storage target (`POST /org/profile/uploads`, Owner/Administrator,
 *  public visibility — T-108) and PUT the real bytes to it. Returns the
 *  publicly-servable URL to store as `logoUrl`/`coverPhotos[0]`. Reuses the
 *  SAME upload plumbing already wired for documents/animal photos — no new
 *  endpoint needed (T-D05 P3 finding: the endpoint already existed, unused by
 *  the UI until now). */
async function uploadProfileImage(client: ApiClient, file: File): Promise<string> {
  const reserved = await client.request<UploadTargetResult>('/org/profile/uploads', {
    method: 'POST',
    json: { filename: file.name, contentType: file.type },
  });
  await uploadFileBytes(client, reserved.key, file);
  // `reserved.url` is the UPLOAD TARGET (`PUT /storage/upload?key=...`) — the
  // disk adapter (apps/api/.../disk-storage.adapter.ts) returns that there, NOT
  // the display URL (confirmed by reading it AND a live curl: the field really
  // is the PUT endpoint). The GET/display URL is built from the SAME key at
  // `/storage/public` (this endpoint always reserves with `visibility: 'public'`
  // — org.controller.ts), same origin as the reserved URL so this works in any
  // environment without hardcoding a base URL.
  const origin = new URL(reserved.url).origin;
  return `${origin}/storage/public?key=${encodeURIComponent(reserved.key)}`;
}

/** Simple camera glyph for the empty image placeholder (feature-local — no
 *  icon library added, same convention as the portal pages' link icons). */
function CameraIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

interface ImageUploadFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  shape: 'circle' | 'rectangle';
}

/**
 * Logo/portada — SOLO subida de archivo (S2-REORG): el campo de texto "URL
 * del logo/portada" se quitó por completo (era jerga técnica innecesaria para
 * un usuario no técnico). `value` sigue siendo una URL internamente — el
 * flujo de guardado (`PUT /org/profile`) no cambia, solo cómo se llena.
 */
function ImageUploadField({ id, label, value, onChange, shape }: ImageUploadFieldProps) {
  const client = useApiClient();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File): Promise<void> => {
    const invalid = validateUpload(file, IMAGE_ACCEPT);
    if (invalid) {
      toast({ title: 'Imagen no válida', description: invalid, variant: 'warning' });
      return;
    }
    setUploading(true);
    try {
      const url = await uploadProfileImage(client, file);
      onChange(url);
      toast({
        title: 'Imagen subida',
        description: 'Haz clic en "Guardar cambios" para aplicarla.',
        variant: 'info',
      });
    } catch (error) {
      toast({
        title: 'No se pudo subir la imagen',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const previewClass =
    shape === 'circle'
      ? 'h-20 w-20 shrink-0 rounded-full border border-border object-cover'
      : 'h-24 w-full rounded-md border border-border object-cover';
  const placeholderClass =
    shape === 'circle'
      ? 'flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-dashed border-border bg-muted text-muted-foreground'
      : 'flex h-24 w-full items-center justify-center rounded-md border border-dashed border-border bg-muted text-muted-foreground';

  return (
    <div className={shape === 'circle' ? 'flex items-center gap-4' : 'space-y-2'}>
      {value ? (
        <img src={value} alt={`Vista previa: ${label}`} className={previewClass} />
      ) : (
        <div aria-hidden className={placeholderClass}>
          <CameraIcon />
        </div>
      )}
      <div className="space-y-1">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <label
          htmlFor={id}
          className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          {uploading
            ? 'Subiendo…'
            : value
              ? `Cambiar ${label.toLowerCase()}`
              : `Subir ${label.toLowerCase()}`}
          <input
            id={id}
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void handleFile(file);
            }}
          />
        </label>
      </div>
    </div>
  );
}

export interface OrgProfileFormProps {
  initial: Organization;
  onSaved: (organization: Organization) => void;
  /** El botón "Guardar cambios" ahora vive en la cabecera de `org-profile-page.tsx`,
   *  no dentro de este formulario — la página necesita saber cuándo deshabilitarlo. */
  onSavingChange?: (saving: boolean) => void;
}

/** Handle imperativo para que `org-profile-page.tsx` dispare el submit desde
 *  el botón "Guardar cambios" de la cabecera (S2-VISUAL-TABS). */
export interface OrgProfileFormHandle {
  submit: () => void;
}

export const OrgProfileForm = forwardRef<OrgProfileFormHandle, OrgProfileFormProps>(
  function OrgProfileForm({ initial, onSaved, onSavingChange }, ref) {
    const client = useApiClient();
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState<string>(TABS[0].value);
    const [form, setForm] = useState<FormState>(() => initialState(initial));
    const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
    const [saving, setSaving] = useState(false);
    // A department's city list is a short, known set (see colombian-locations.ts);
    // "custom" tracks whether the CITY select shows the free-text fallback. Derived
    // once from the loaded record so pre-existing data outside the static catalog
    // (e.g. this exact demo seed's Cundinamarca/Bogotá pairing) still displays.
    const [customCity, setCustomCity] = useState(() => {
      const loaded = initialState(initial);
      return !!loaded.city && !citiesForDepartment(loaded.department).includes(loaded.city);
    });

    useEffect(() => {
      onSavingChange?.(saving);
    }, [saving, onSavingChange]);

    const set = (key: keyof FormState) => (value: string) =>
      setForm((prev) => ({ ...prev, [key]: value }));

    /** Validación EN VIVO (mientras escribe), no solo al enviar — a
     *  diferencia de `validate()` de abajo, que solo corre en el submit. */
    const setSlug = (value: string) => {
      setForm((prev) => ({ ...prev, slug: value }));
      setErrors((prev) => ({ ...prev, slug: validateOptionalSlug(value) }));
    };
    const slugSuggestion = errors.slug && form.slug.trim() ? slugify(form.slug) : '';
    const showSlugSuggestion = slugSuggestion !== '' && slugSuggestion !== form.slug.trim();
    /** Vista previa real del enlace público — mismo origen que el navegador
     *  ya está usando (funciona en dev y en cualquier dominio de producción,
     *  sin hardcodear uno). */
    const slugPreviewUrl = `${window.location.origin}/o/${form.slug.trim() || 'tu-organizacion'}`;

    const validate = (): boolean => {
      const next: Partial<Record<keyof FormState, string>> = {
        slug: validateOptionalSlug(form.slug),
        contactEmail: validateOptionalEmail(form.contactEmail),
        instagram: validateOptionalUrl(form.instagram),
        facebook: validateOptionalUrl(form.facebook),
        tiktok: validateOptionalUrl(form.tiktok),
        website: validateOptionalUrl(form.website),
        contactMapUrl: validateOptionalUrl(form.contactMapUrl),
        name: form.name.trim() ? undefined : 'El nombre es obligatorio.',
      };
      const cleaned = Object.fromEntries(Object.entries(next).filter(([, v]) => v));
      setErrors(cleaned);
      if (Object.keys(cleaned).length > 0) {
        toast({
          title: 'Completa los campos requeridos',
          description: 'Revisa los campos marcados en rojo antes de guardar.',
          variant: 'warning',
        });
      }
      return Object.keys(cleaned).length === 0;
    };

    const handleSubmit = async () => {
      if (!validate()) return;
      setSaving(true);
      try {
        const updated = await client.request<Organization>('/org/profile', {
          method: 'PUT',
          json: buildPayload(form),
        });
        toast({
          title: 'Cambios guardados correctamente',
          description: 'Tu perfil institucional se actualizó.',
          variant: 'success',
        });
        onSaved(updated);
      } catch (error) {
        toast({
          title: 'Error al guardar',
          description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
          variant: 'destructive',
        });
      } finally {
        setSaving(false);
      }
    };

    useImperativeHandle(ref, () => ({ submit: () => void handleSubmit() }));

    const cityOptions = citiesForDepartment(form.department);
    const departmentOptions = DEPARTMENTS.some((d) => d.value === form.department)
      ? DEPARTMENTS
      : form.department
        ? [...DEPARTMENTS, { value: form.department, label: form.department, cities: [] }]
        : DEPARTMENTS;

    return (
      <div className={styles['org-form']}>
        <OrgTabsNav
          items={TABS}
          value={activeTab}
          onValueChange={setActiveTab}
          ariaLabel="Secciones del perfil de la organización"
        />

        <OrgTabPanel value="institucional" activeValue={activeTab}>
          <div className="grid gap-4 md:grid-cols-2">
            <OrgTextField
              id="org-name"
              label="Nombre"
              value={form.name}
              onChange={set('name')}
              error={errors.name}
            />
            <div>
              <OrgTextField
                id="org-slug"
                label="Dirección de tu portal público"
                value={form.slug}
                onChange={setSlug}
                error={errors.slug}
                hint={`Así se verá el enlace de tu organización: ${slugPreviewUrl}`}
              />
              {showSlugSuggestion && (
                <button
                  type="button"
                  onClick={() => setSlug(slugSuggestion)}
                  className="mt-1 text-xs font-medium text-primary hover:underline"
                >
                  Usar "{slugSuggestion}"
                </button>
              )}
            </div>
            <OrgTextField
              id="org-nit"
              label="NIT"
              value={form.nit}
              onChange={set('nit')}
              error={errors.nit}
            />
            <OrgTextField
              id="org-legal"
              label="Razón social"
              value={form.legalName}
              onChange={set('legalName')}
              error={errors.legalName}
            />
            <div className="md:col-span-2">
              <OrgTextAreaField
                id="org-desc"
                label="Descripción corta"
                value={form.description}
                onChange={set('description')}
                error={errors.description}
              />
            </div>
          </div>
        </OrgTabPanel>

        <OrgTabPanel value="ubicacion" activeValue={activeTab}>
          <div className="grid gap-4 md:grid-cols-2">
            <OrgStaticField id="org-country" label="País" value={COLOMBIA} />
            <OrgSelectField
              id="org-department"
              label="Departamento"
              value={form.department}
              placeholder="Selecciona un departamento…"
              options={departmentOptions.map((d) => ({ value: d.value, label: d.label }))}
              onChange={(department) => {
                setForm((prev) => ({ ...prev, department, city: '' }));
                setCustomCity(false);
              }}
            />
            <div>
              <OrgSelectField
                id="org-city"
                label="Ciudad / Municipio"
                value={customCity ? OTHER_CITY_VALUE : form.city}
                disabled={!form.department}
                placeholder={
                  form.department ? 'Selecciona una ciudad…' : 'Elige un departamento primero'
                }
                options={[
                  ...cityOptions.map((city) => ({ value: city, label: city })),
                  { value: OTHER_CITY_VALUE, label: 'Otro municipio…' },
                ]}
                onChange={(value) => {
                  if (value === OTHER_CITY_VALUE) {
                    setCustomCity(true);
                    set('city')('');
                  } else {
                    setCustomCity(false);
                    set('city')(value);
                  }
                }}
              />
              {customCity && (
                <div className="mt-3">
                  <OrgTextField
                    id="org-city-custom"
                    label="Municipio"
                    placeholder="Escribe el municipio"
                    value={form.city}
                    onChange={set('city')}
                  />
                </div>
              )}
            </div>
            <OrgTextField
              id="org-address"
              label="Dirección"
              value={form.address}
              onChange={set('address')}
            />
          </div>
        </OrgTabPanel>

        <OrgTabPanel value="contacto" activeValue={activeTab}>
          <div className="grid gap-4 md:grid-cols-2">
            <OrgTextField
              id="org-email"
              label="Correo de contacto"
              value={form.contactEmail}
              onChange={set('contactEmail')}
              error={errors.contactEmail}
            />
            <OrgTextField
              id="org-whatsapp"
              label="WhatsApp"
              value={form.whatsapp}
              onChange={set('whatsapp')}
              error={errors.whatsapp}
            />
            <OrgTextField
              id="org-phone"
              label="Teléfono"
              value={form.phone}
              onChange={set('phone')}
              error={errors.phone}
              hint="No se muestra en el portal público."
            />
          </div>

          {/* Información de contacto extendida (S2-REORG: movida desde
              Personalización; el mapa se corrige del lado del portal público,
              ver PortalContactInfoSection/model/google-maps.ts). El spec de
              este refactor no le da tab propio — vive aquí porque es la misma
              categoría de información (contacto), solo que orientada al
              portal público en vez del back-office. */}
          <p className={styles['org-form__section-label']}>Información de contacto extendida</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <OrgTextField
              id="org-contact-hours"
              label="Horario de atención"
              value={form.contactHours}
              onChange={set('contactHours')}
              placeholder="Lun-Vie 9:00am - 5:00pm"
            />
            <OrgTextField
              id="org-contact-address"
              label="Dirección completa"
              value={form.contactFullAddress}
              onChange={set('contactFullAddress')}
              placeholder="Calle 45 #12-34, Bogotá"
            />
            <OrgTextField
              id="org-contact-map"
              label="Ubicación en el mapa"
              type="url"
              value={form.contactMapUrl}
              onChange={set('contactMapUrl')}
              error={errors.contactMapUrl}
              placeholder="Pega el enlace de Google Maps de tu ubicación"
              hint="Busca tu ubicación en Google Maps, copia el enlace y pégalo aquí."
            />
            <OrgTextField
              id="org-contact-phones"
              label="Teléfonos adicionales"
              value={form.contactPhones}
              onChange={set('contactPhones')}
              placeholder="3001234567, 3007654321"
              hint="Separados por coma o uno por línea."
            />
          </div>
          <p className={styles['org-form__help']}>
            Esta información aparece en la sección "Información" de tu portal público.
          </p>
        </OrgTabPanel>

        <OrgTabPanel value="imagenes" activeValue={activeTab}>
          <div className="space-y-6">
            <ImageUploadField
              id="org-logo-upload"
              label="Logo"
              value={form.logoUrl}
              onChange={set('logoUrl')}
              shape="circle"
            />
            <ImageUploadField
              id="org-cover-upload"
              label="Portada"
              value={form.coverUrl}
              onChange={set('coverUrl')}
              shape="rectangle"
            />
            <div className="grid gap-4 md:grid-cols-2">
              <OrgTextField
                id="org-instagram"
                label="Instagram"
                value={form.instagram}
                onChange={set('instagram')}
                error={errors.instagram}
              />
              <OrgTextField
                id="org-facebook"
                label="Facebook"
                value={form.facebook}
                onChange={set('facebook')}
                error={errors.facebook}
              />
              <OrgTextField
                id="org-tiktok"
                label="TikTok"
                value={form.tiktok}
                onChange={set('tiktok')}
                error={errors.tiktok}
              />
              <OrgTextField
                id="org-website"
                label="Sitio web"
                value={form.website}
                onChange={set('website')}
                error={errors.website}
              />
            </div>
          </div>
        </OrgTabPanel>

        <OrgTabPanel value="nosotros" activeValue={activeTab}>
          <OrgTextAreaField
            id="org-about-us"
            label="Quiénes somos"
            value={form.aboutUs}
            onChange={set('aboutUs')}
            rows={8}
            maxLength={ABOUT_US_MAX}
            placeholder="Cuéntale al mundo quiénes son, su historia, su misión y por qué hacen lo que hacen..."
            hint='Este texto aparece en la sección "Nosotros" de tu portal público.'
          />
        </OrgTabPanel>
      </div>
    );
  },
);

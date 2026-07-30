import { useState } from 'react';
import type { Organization, UpdateOrganizationProfileInput } from '@adoptafacil/contracts';
import { Button, Card, CardContent, CardHeader, CardTitle, useToast } from '@adoptafacil/ui';
import { useApiClient, type ApiClient } from '../../../shell/api';
import {
  COLOMBIA,
  DEPARTMENTS,
  OTHER_CITY_VALUE,
  citiesForDepartment,
} from '../data/colombian-locations';
import { IMAGE_ACCEPT, uploadFileBytes, validateUpload } from '../lib/storage';
import { TextAreaField, TextField } from './profile-fields';
import {
  parseUrlLines,
  validateOptionalEmail,
  validateOptionalSlug,
  validateOptionalUrl,
} from '../validation';

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
  coverPhotos: string; // one URL per line
  department: string;
  city: string;
  address: string;
  instagram: string;
  facebook: string;
  tiktok: string;
  website: string;
}

function initialState(org: Organization): FormState {
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
    coverPhotos: (org.coverPhotos ?? []).join('\n'),
    department: org.location?.department ?? '',
    city: org.location?.city ?? '',
    address: org.location?.address ?? '',
    instagram: org.socialLinks?.instagram ?? '',
    facebook: org.socialLinks?.facebook ?? '',
    tiktok: org.socialLinks?.tiktok ?? '',
    website: org.socialLinks?.website ?? '',
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
    coverPhotos: parseUrlLines(form.coverPhotos),
    location,
    ...(hasAnySocialLink ? { socialLinks } : {}),
  };
}

interface UploadTargetResult {
  url: string;
  key: string;
}

/** Reserve a storage target (`POST /org/profile/uploads`, Owner/Administrator,
 *  public visibility — T-108) and PUT the real bytes to it. Returns the
 *  publicly-servable URL to store as `logoUrl`/a `coverPhotos` entry. Reuses
 *  the SAME upload plumbing already wired for documents/animal photos — no new
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

interface LogoFieldProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

/** URL field + "O sube una imagen" fallback (T-D05 P3) — the URL stays the
 *  source of truth (still directly editable), the file input just fills it in
 *  via the real upload endpoint. Preview reflects whatever `value` currently is. */
function LogoField({ value, onChange, error }: LogoFieldProps) {
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

  return (
    <div className="space-y-2">
      <TextField
        id="org-logo"
        label="URL del logo"
        value={value}
        onChange={onChange}
        error={error}
      />
      <div className="flex items-center gap-3">
        <label className="cursor-pointer text-sm font-medium text-primary hover:underline">
          {uploading ? 'Subiendo…' : 'O sube una imagen'}
          <input
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
        {value && (
          <img
            src={value}
            alt="Vista previa del logo"
            className="h-12 w-12 rounded border border-border object-cover"
          />
        )}
      </div>
    </div>
  );
}

interface CoverPhotosFieldProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

/** Same upload fallback as the logo, but APPENDS a new line instead of
 *  replacing (this field holds a "one URL per line" list, T-D05 P3). */
function CoverPhotosField({ value, onChange, error }: CoverPhotosFieldProps) {
  const client = useApiClient();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const urls = parseUrlLines(value);

  const handleFile = async (file: File): Promise<void> => {
    const invalid = validateUpload(file, IMAGE_ACCEPT);
    if (invalid) {
      toast({ title: 'Imagen no válida', description: invalid, variant: 'warning' });
      return;
    }
    setUploading(true);
    try {
      const url = await uploadProfileImage(client, file);
      onChange(value.trim() ? `${value.trim()}\n${url}` : url);
      toast({
        title: 'Imagen subida',
        description: 'Se agregó a la lista. Haz clic en "Guardar cambios" para aplicarla.',
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

  return (
    <div className="space-y-2">
      <TextAreaField
        id="org-covers"
        label="Fotos de portada (una URL por línea)"
        value={value}
        onChange={onChange}
        error={error}
      />
      <div className="flex items-center gap-3">
        <label className="cursor-pointer text-sm font-medium text-primary hover:underline">
          {uploading ? 'Subiendo…' : 'O sube una imagen'}
          <input
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
      {urls.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {urls.map((url) => (
            <img
              key={url}
              src={url}
              alt="Vista previa de portada"
              className="h-12 w-20 rounded border border-border object-cover"
            />
          ))}
        </div>
      )}
    </div>
  );
}

export interface OrgProfileFormProps {
  initial: Organization;
  onSaved: (organization: Organization) => void;
}

export function OrgProfileForm({ initial, onSaved }: OrgProfileFormProps) {
  const client = useApiClient();
  const { toast } = useToast();
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

  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {
      slug: validateOptionalSlug(form.slug),
      contactEmail: validateOptionalEmail(form.contactEmail),
      logoUrl: validateOptionalUrl(form.logoUrl),
      instagram: validateOptionalUrl(form.instagram),
      facebook: validateOptionalUrl(form.facebook),
      tiktok: validateOptionalUrl(form.tiktok),
      website: validateOptionalUrl(form.website),
      coverPhotos: parseUrlLines(form.coverPhotos)
        .map((u) => validateOptionalUrl(u))
        .find(Boolean),
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

  const cityOptions = citiesForDepartment(form.department);
  const departmentOptions = DEPARTMENTS.some((d) => d.value === form.department)
    ? DEPARTMENTS
    : form.department
      ? [...DEPARTMENTS, { value: form.department, label: form.department, cities: [] }]
      : DEPARTMENTS;

  return (
    <div className="space-y-6 pb-20">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Datos institucionales</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <TextField
                id="org-name"
                label="Nombre"
                value={form.name}
                onChange={set('name')}
                error={errors.name}
              />
              <TextField
                id="org-slug"
                label="Slug del portal"
                value={form.slug}
                onChange={set('slug')}
                error={errors.slug}
                hint="Se usa en /o/&lt;slug&gt;"
              />
              <TextField
                id="org-nit"
                label="NIT"
                value={form.nit}
                onChange={set('nit')}
                error={errors.nit}
              />
              <TextField
                id="org-legal"
                label="Razón social"
                value={form.legalName}
                onChange={set('legalName')}
                error={errors.legalName}
              />
              <div className="sm:col-span-2">
                <TextAreaField
                  id="org-desc"
                  label="Descripción"
                  value={form.description}
                  onChange={set('description')}
                  error={errors.description}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ubicación</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <span className="block text-sm font-medium text-foreground">País</span>
                <p className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                  {COLOMBIA}
                </p>
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="org-department"
                  className="block text-sm font-medium text-foreground"
                >
                  Departamento
                </label>
                <select
                  id="org-department"
                  value={form.department}
                  onChange={(event) => {
                    const department = event.target.value;
                    setForm((prev) => ({ ...prev, department, city: '' }));
                    setCustomCity(false);
                  }}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Selecciona un departamento…</option>
                  {departmentOptions.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="org-city" className="block text-sm font-medium text-foreground">
                  Ciudad / Municipio
                </label>
                <select
                  id="org-city"
                  value={customCity ? OTHER_CITY_VALUE : form.city}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === OTHER_CITY_VALUE) {
                      setCustomCity(true);
                      set('city')('');
                    } else {
                      setCustomCity(false);
                      set('city')(value);
                    }
                  }}
                  disabled={!form.department}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">
                    {form.department ? 'Selecciona una ciudad…' : 'Elige un departamento primero'}
                  </option>
                  {cityOptions.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                  <option value={OTHER_CITY_VALUE}>Otro municipio…</option>
                </select>
                {customCity && (
                  <div className="mt-1.5">
                    <TextField
                      id="org-city-custom"
                      label="Municipio"
                      placeholder="Escribe el municipio"
                      value={form.city}
                      onChange={set('city')}
                    />
                  </div>
                )}
              </div>
              <TextField
                id="org-address"
                label="Dirección"
                value={form.address}
                onChange={set('address')}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contacto</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <TextField
                id="org-email"
                label="Correo de contacto"
                value={form.contactEmail}
                onChange={set('contactEmail')}
                error={errors.contactEmail}
              />
              <TextField
                id="org-whatsapp"
                label="WhatsApp"
                value={form.whatsapp}
                onChange={set('whatsapp')}
                error={errors.whatsapp}
              />
              <TextField
                id="org-phone"
                label="Teléfono"
                value={form.phone}
                onChange={set('phone')}
                error={errors.phone}
                hint="No se muestra en el portal público."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Imágenes y redes</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <LogoField value={form.logoUrl} onChange={set('logoUrl')} error={errors.logoUrl} />
              </div>
              <div className="sm:col-span-2">
                <CoverPhotosField
                  value={form.coverPhotos}
                  onChange={set('coverPhotos')}
                  error={errors.coverPhotos}
                />
              </div>
              <TextField
                id="org-instagram"
                label="Instagram"
                value={form.instagram}
                onChange={set('instagram')}
                error={errors.instagram}
              />
              <TextField
                id="org-facebook"
                label="Facebook"
                value={form.facebook}
                onChange={set('facebook')}
                error={errors.facebook}
              />
              <TextField
                id="org-tiktok"
                label="TikTok"
                value={form.tiktok}
                onChange={set('tiktok')}
                error={errors.tiktok}
              />
              <TextField
                id="org-website"
                label="Sitio web"
                value={form.website}
                onChange={set('website')}
                error={errors.website}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* `sticky` (not `fixed`) so it never escapes the content column and
          overlaps the sidebar — it sticks to the bottom of the VIEWPORT while
          staying within its normal-flow horizontal bounds. */}
      <div className="sticky inset-x-0 bottom-0 z-40 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6">
        <div className="flex justify-end">
          <Button onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      </div>
    </div>
  );
}

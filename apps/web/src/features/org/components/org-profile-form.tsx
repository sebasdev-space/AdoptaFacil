import { useState } from 'react';
import type { FormalizationState } from '@adoptafacil/contracts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from '@adoptafacil/ui';
import { useApiClient, type ApiClient } from '../../../shell/api';
import {
  COLOMBIA,
  DEPARTMENTS,
  OTHER_CITY_VALUE,
  citiesForDepartment,
} from '../data/colombian-locations';
import type { OrgProfileEditor } from '../hooks/use-org-profile-editor';
import { IMAGE_ACCEPT, uploadFileBytes, validateUpload } from '../lib/storage';
import { OrgLivePreview } from './org-live-preview';
import { TextAreaField, TextField } from './profile-fields';

const ABOUT_US_MAX = 2000;

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
  editor: OrgProfileEditor;
  /** Last SAVED formalization state (never the draft) — read by the live
   *  preview only, matching `OrgActionBar`'s Formalización pill. */
  formalizationState?: FormalizationState;
}

/**
 * The 5-tab body of "Mi organización" (S2-05) — REORGANIZES the same 6 cards
 * S2-REORG built (Datos institucionales / Contacto / Ubicación / Imágenes y
 * redes / Acerca de nosotros / Información de contacto extendida) into the
 * 5 tabs the redesign mock specifies, merging "Contacto" + "Información de
 * contacto extendida" into ONE "Contacto" tab (exactly as the Prompt Spec's
 * tab breakdown lists them together). Every field, id, and the `PUT
 * /org/profile` payload shape are UNCHANGED from before the redesign — only
 * the grouping/layout moved (see `model/org-profile-form-state.ts` and
 * `hooks/use-org-profile-editor.ts`, extracted verbatim from the old
 * single-file version so nothing was rewritten from scratch).
 */
export function OrgProfileForm({ editor, formalizationState }: OrgProfileFormProps) {
  const { form, set, errors, customCity, setCustomCity } = editor;

  const cityOptions = citiesForDepartment(form.department);
  const departmentOptions = DEPARTMENTS.some((d) => d.value === form.department)
    ? DEPARTMENTS
    : form.department
      ? [...DEPARTMENTS, { value: form.department, label: form.department, cities: [] }]
      : DEPARTMENTS;

  return (
    <div className="grid gap-6 pb-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <Tabs defaultValue="datos">
        <div className="overflow-x-auto">
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="datos">Datos institucionales</TabsTrigger>
            <TabsTrigger value="ubicacion">Ubicación</TabsTrigger>
            <TabsTrigger value="contacto">Contacto</TabsTrigger>
            <TabsTrigger value="medios">Imágenes y redes</TabsTrigger>
            <TabsTrigger value="acerca">Acerca de nosotros</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="datos">
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
        </TabsContent>

        <TabsContent value="ubicacion">
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
                    set('department')(department);
                    set('city')('');
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
        </TabsContent>

        <TabsContent value="contacto">
          <Card>
            <CardHeader>
              <CardTitle>Contacto</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
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
              </div>
              <div className="grid gap-4 border-t border-dashed border-border pt-4 sm:grid-cols-2">
                <TextField
                  id="org-contact-hours"
                  label="Horario de atención"
                  value={form.contactHours}
                  onChange={set('contactHours')}
                  placeholder="Lun-Vie 9:00am - 5:00pm"
                />
                <TextField
                  id="org-contact-phones"
                  label="Teléfonos adicionales"
                  value={form.contactPhones}
                  onChange={set('contactPhones')}
                  placeholder="3001234567, 3007654321"
                  hint="Separados por coma o uno por línea."
                />
                <TextField
                  id="org-contact-address"
                  label="Dirección completa"
                  value={form.contactFullAddress}
                  onChange={set('contactFullAddress')}
                  placeholder="Calle 45 #12-34, Bogotá"
                />
                <TextField
                  id="org-contact-map"
                  label="Ubicación en el mapa"
                  type="url"
                  value={form.contactMapUrl}
                  onChange={set('contactMapUrl')}
                  error={errors.contactMapUrl}
                  placeholder="Pega el enlace de Google Maps de tu ubicación"
                  hint="Busca tu ubicación en Google Maps, copia el enlace y pégalo aquí."
                />
              </div>
              <p className="text-xs text-muted-foreground">
                La información de horario/dirección/mapa/teléfonos adicionales aparece en la sección
                "Información" de tu portal público.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="medios">
          <Card>
            <CardHeader>
              <CardTitle>Imágenes y redes sociales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
              <div className="grid gap-4 sm:grid-cols-2">
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
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="acerca">
          <Card>
            <CardHeader>
              <CardTitle>Acerca de nosotros</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <label htmlFor="org-about-us" className="block text-sm font-medium text-foreground">
                Quiénes somos
              </label>
              <textarea
                id="org-about-us"
                value={form.aboutUs}
                maxLength={ABOUT_US_MAX}
                placeholder="Cuéntale al mundo quiénes son, su historia, su misión y por qué hacen lo que hacen..."
                onChange={(event) => set('aboutUs')(event.target.value)}
                className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <p className="text-right text-xs text-muted-foreground">
                {form.aboutUs.length}/{ABOUT_US_MAX}
              </p>
              <p className="text-xs text-muted-foreground">
                Este texto aparece en la sección "Nosotros" de tu portal público.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="lg:sticky lg:top-6">
        <OrgLivePreview
          name={form.name}
          city={form.city}
          description={form.description}
          whatsapp={form.whatsapp}
          logoUrl={form.logoUrl}
          hasInstagram={!!form.instagram.trim()}
          hasFacebook={!!form.facebook.trim()}
          hasWebsite={!!form.website.trim()}
          formalizationState={formalizationState}
        />
      </div>
    </div>
  );
}

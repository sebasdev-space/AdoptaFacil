import { useState } from 'react';
import type { Organization, UpdateOrganizationProfileInput } from '@adoptafacil/contracts';
import { Button, Card, CardContent, CardHeader, CardTitle, useToast } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
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
  country: string;
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
    country: org.location?.country ?? '',
    department: org.location?.department ?? '',
    city: org.location?.city ?? '',
    address: org.location?.address ?? '',
    instagram: org.socialLinks?.instagram ?? '',
    facebook: org.socialLinks?.facebook ?? '',
    tiktok: org.socialLinks?.tiktok ?? '',
    website: org.socialLinks?.website ?? '',
  };
}

/** Trim; return undefined when empty so the PATCH omits untouched fields. */
function clean(value: string): string | undefined {
  const v = value.trim();
  return v ? v : undefined;
}

function buildPayload(form: FormState): UpdateOrganizationProfileInput {
  const location = {
    country: clean(form.country),
    department: clean(form.department),
    city: clean(form.city),
    address: clean(form.address),
  };
  const socialLinks = {
    instagram: clean(form.instagram),
    facebook: clean(form.facebook),
    tiktok: clean(form.tiktok),
    website: clean(form.website),
  };
  const hasAny = (obj: Record<string, string | undefined>): boolean =>
    Object.values(obj).some((v) => v !== undefined);

  return {
    name: clean(form.name),
    slug: clean(form.slug),
    nit: clean(form.nit),
    legalName: clean(form.legalName),
    description: clean(form.description),
    contactEmail: clean(form.contactEmail),
    whatsapp: clean(form.whatsapp),
    phone: clean(form.phone),
    logoUrl: clean(form.logoUrl),
    coverPhotos: parseUrlLines(form.coverPhotos),
    ...(hasAny(location) ? { location } : {}),
    ...(hasAny(socialLinks) ? { socialLinks } : {}),
  };
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
        title: 'Perfil actualizado',
        description: 'Los cambios se guardaron correctamente.',
      });
      onSaved(updated);
    } catch (error) {
      toast({
        title: 'No se pudo guardar',
        description: error instanceof Error ? error.message : 'Inténtalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
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
          <CardTitle>Ubicación</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <TextField id="org-country" label="País" value={form.country} onChange={set('country')} />
          <TextField
            id="org-department"
            label="Departamento"
            value={form.department}
            onChange={set('department')}
          />
          <TextField id="org-city" label="Ciudad" value={form.city} onChange={set('city')} />
          <TextField
            id="org-address"
            label="Dirección"
            value={form.address}
            onChange={set('address')}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Imágenes y redes</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="org-logo"
            label="URL del logo"
            value={form.logoUrl}
            onChange={set('logoUrl')}
            error={errors.logoUrl}
          />
          <div className="sm:col-span-2">
            <TextAreaField
              id="org-covers"
              label="Fotos de portada (una URL por línea)"
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

      <div className="flex justify-end">
        <Button onClick={() => void handleSubmit()} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
    </div>
  );
}

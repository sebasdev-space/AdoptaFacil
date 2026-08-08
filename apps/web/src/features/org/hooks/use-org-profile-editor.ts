import { useEffect, useState } from 'react';
import type { Organization } from '@adoptafacil/contracts';
import { useToast } from '@adoptafacil/ui';
import { useApiClient } from '../../../shell/api';
import { citiesForDepartment } from '../data/colombian-locations';
import {
  buildProfilePayload,
  initialFormState,
  type FormState,
} from '../model/org-profile-form-state';
import { validateOptionalEmail, validateOptionalSlug, validateOptionalUrl } from '../validation';

const EMPTY_FORM_STATE: FormState = {
  name: '',
  slug: '',
  nit: '',
  legalName: '',
  description: '',
  contactEmail: '',
  whatsapp: '',
  phone: '',
  logoUrl: '',
  coverUrl: '',
  department: '',
  city: '',
  address: '',
  instagram: '',
  facebook: '',
  tiktok: '',
  website: '',
  aboutUs: '',
  contactHours: '',
  contactFullAddress: '',
  contactMapUrl: '',
  contactPhones: '',
};

/**
 * Owns the draft/save state for "Mi organización" (S2-05). Lifted OUT of the
 * old single `OrgProfileForm` component so the top bar's "Guardar cambios"
 * button (now in `org-profile-page.tsx`) and the 5-tab field layout share the
 * SAME state instance — the top bar triggers `handleSubmit`, the tabs render
 * `form`/`set`/`errors`, and the live-preview panel reads `form` directly for
 * a real-time reflection of unsaved edits.
 *
 * `initial` is nullable so `OrgProfilePage` can call this hook UNCONDITIONALLY
 * (before the org fetch resolves) and keep ONE stable component tree — see the
 * S2-05 closing report for the remount bug this fixes: conditionally mounting
 * a DIFFERENT top-bar/body pair once `org` loads (instead of reusing the same
 * `<PageHeader>` slot) caused React to replace that DOM node, which is
 * invisible to a human but detaches any element reference a test grabbed a
 * moment earlier. The draft resyncs via `useEffect` whenever `initial` changes
 * (the null→loaded transition, and again after each successful save).
 */
export function useOrgProfileEditor(
  initial: Organization | null,
  onSaved: (org: Organization) => void,
) {
  const client = useApiClient();
  const { toast } = useToast();
  const [form, setFormState] = useState<FormState>(() =>
    initial ? initialFormState(initial) : EMPTY_FORM_STATE,
  );
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);
  // A department's city list is a short, known set (see colombian-locations.ts);
  // "custom" tracks whether the CITY select shows the free-text fallback. Derived
  // once from the loaded record so pre-existing data outside the static catalog
  // still displays.
  const [customCity, setCustomCity] = useState(() => {
    const loaded = initial ? initialFormState(initial) : EMPTY_FORM_STATE;
    return !!loaded.city && !citiesForDepartment(loaded.department).includes(loaded.city);
  });

  useEffect(() => {
    if (!initial) return;
    const loaded = initialFormState(initial);
    setFormState(loaded);
    setCustomCity(!!loaded.city && !citiesForDepartment(loaded.department).includes(loaded.city));
  }, [initial]);

  const set = (key: keyof FormState) => (value: string) =>
    setFormState((prev) => ({ ...prev, [key]: value }));

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

  const handleSubmit = async (): Promise<void> => {
    if (!validate()) return;
    setSaving(true);
    try {
      const updated = await client.request<Organization>('/org/profile', {
        method: 'PUT',
        json: buildProfilePayload(form),
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

  return {
    form,
    set,
    errors,
    saving,
    customCity,
    setCustomCity,
    handleSubmit: () => void handleSubmit(),
  };
}

export type OrgProfileEditor = ReturnType<typeof useOrgProfileEditor>;
